// Persistence edge cases for src/state/serialize.ts.
// Run: node qa-tests/serialize-probe.mjs
// Expects the corrected behaviour (skips bad entries, unique ids, wrapped time, bounded positions, size cap).
import { createServer } from 'vite'

const assert = (c, m) => { if (!c) throw new Error(m) }
const results = []
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('✔', name) }
  catch (e) { results.push({ name, ok: false, err: String(e.message || e) }); console.log('✘', name, '—', e.message) }
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { parseWorld, encodeShare, decodeShare, toJSON } = await server.ssrLoadModule('/src/state/serialize.ts')

const base = { v: 1, name: '探针', time: 12, weather: 'clear', gravity: 1, orbit: false, objects: [], clouds: [] }

await test('null object/cloud entries are skipped, rest of the doc survives', async () => {
  const doc = parseWorld({
    ...base,
    objects: [null, 1, { id: 'tree-ok', type: 'tree', pos: [1, 2, 3] }, undefined],
    clouds: [null, { id: 'cloud-ok', pos: [4, 80, -200], scale: 1, seed: 3 }],
  })
  assert(doc.objects.length === 1 && doc.objects[0].id === 'tree-ok', JSON.stringify(doc.objects))
  assert(doc.clouds.length === 1 && doc.clouds[0].id === 'cloud-ok', JSON.stringify(doc.clouds))
  assert(doc.name === '探针', 'name lost')
})

await test('duplicate and blank ids are rewritten so every id is unique and non-empty', async () => {
  const doc = parseWorld({
    ...base,
    objects: [
      { id: 'same', type: 'tree', pos: [0, 0, 0] },
      { id: 'same', type: 'rock', pos: [1, 0, 0] },
      { id: '', type: 'bench', pos: [2, 0, 0] },
      { id: '   ', type: 'lamp', pos: [3, 0, 0] },
    ],
    clouds: [{ id: 'same', pos: [0, 40, -100], scale: 1, seed: 1 }],
  })
  const ids = [...doc.objects.map((o) => o.id), ...doc.clouds.map((c) => c.id)]
  assert(ids.length === 5, 'count ' + ids.length)
  assert(new Set(ids).size === ids.length, 'dup ids ' + ids.join(','))
  assert(ids.every((id) => typeof id === 'string' && id.trim().length > 0), 'blank id ' + JSON.stringify(ids))
})

await test('time wraps onto [0, 24) instead of clamping to 24', async () => {
  assert(parseWorld({ ...base, time: 24 }).time === 0, 'time 24')
  assert(parseWorld({ ...base, time: 30 }).time === 6, 'time 30 → ' + parseWorld({ ...base, time: 30 }).time)
  assert(parseWorld({ ...base, time: -1 }).time === 23, 'time -1')
  assert(Math.abs(parseWorld({ ...base, time: 18.64 }).time - 18.64) < 1e-9, 'time 18.64')
  assert(parseWorld({ ...base, time: NaN }).time === 8, 'NaN time')
})

await test('absurd positions are finite and inside a safe bound (terrainHeight(1e308) is NaN)', async () => {
  const doc = parseWorld({ ...base, objects: [{ id: 'far', type: 'tree', pos: [1e308, -1e308, 1e20] }] })
  const [x, y, z] = doc.objects[0].pos
  for (const n of [x, y, z]) assert(Number.isFinite(n) && Math.abs(n) <= 5000, 'pos ' + [x, y, z])
})

await test('round-trip of a normal document preserves fields', async () => {
  const doc = parseWorld({
    ...base, name: '测试', time: 18.64, weather: 'mist', gravity: -0.6, orbit: true,
    objects: [{ id: 'tree-1', type: 'tree', pos: [1.234, 2.345, -3.456], rotY: 1.239, scale: 1.15, variant: 2, floating: true }],
    clouds: [{ id: 'cloud-1', pos: [-10.5, 80.2, -200], scale: 1.2, seed: 7 }],
  })
  const back = await decodeShare(await encodeShare(doc))
  assert(back.name === '测试' && back.weather === 'mist' && back.orbit === true, JSON.stringify(back))
  assert(back.objects[0].floating === true && back.objects[0].type === 'tree', 'object')
  assert(Math.abs(back.gravity + 0.6) < 1e-9, 'gravity')
  assert(back.clouds[0].id === 'cloud-1', 'cloud')
})

await test('truncated, wrong-kind, and oversized shares throw instead of hanging', async () => {
  const good = await encodeShare(parseWorld(base))
  for (const s of ['', 'z', 'j', 'j!!!', good.slice(0, 12), 'j' + good.slice(1)]) {
    let threw = false
    try { await decodeShare(s) } catch { threw = true }
    assert(threw, 'expected throw for ' + JSON.stringify(s).slice(0, 40))
  }
  const huge = 'z' + 'A'.repeat(250_000)
  const t0 = Date.now()
  let threw = false
  try { await decodeShare(huge) } catch { threw = true }
  assert(threw, 'oversized share was accepted')
  assert(Date.now() - t0 < 1000, 'oversized share took too long ' + (Date.now() - t0))

  // highly compressible payload: small wire size, multi-megabyte JSON
  const fat = new TextEncoder().encode(JSON.stringify({ ...base, name: 'A'.repeat(2_000_000) }))
  const packed = await new Response(new Blob([fat]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
  const bytes = new Uint8Array(packed)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const code = 'z' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  assert(code.length < 200_000, 'probe payload itself exceeds the char cap (' + code.length + ')')
  let bomb = false
  try { await decodeShare(code) } catch { bomb = true }
  assert(bomb, 'decompression bomb was accepted, json would be ' + fat.byteLength + ' bytes from ' + code.length + ' chars')
})

await test('toJSON keeps a normal hour from rounding up to 24', async () => {
  const raw = toJSON({ ...base, time: 23.916666666666668, objects: [], clouds: [] })
  const parsed = JSON.parse(raw)
  assert(parsed.time < 24, 'rounded to ' + parsed.time)
})

await server.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
