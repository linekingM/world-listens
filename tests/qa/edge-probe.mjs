// Follow-ups the main probe did not settle: pointer-id steal, object cap,
// camera snap after the resize has actually landed, Ctrl+F vs the float shortcut.
// Run: BASE=http://127.0.0.1:4174 node qa-tests/edge-probe.mjs
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4174'
const results = []
const assert = (c, m) => { if (!c) throw new Error(m) }
async function test(name, fn) {
  const t0 = Date.now()
  try { await fn(); results.push({ name, ok: true }); console.log('✔', name, `${((Date.now() - t0) / 1000).toFixed(1)}s`) }
  catch (e) { results.push({ name, ok: false, err: String(e.message || e).slice(0, 500) }); console.log('✘', name, '—', e.message) }
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

async function boot() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
  const page = await ctx.newPage()
  await page.goto(BASE + '/?fresh&t=10', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__world, null, { timeout: 30000 })
  return { ctx, page }
}
const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
  const f0 = window.__frames ?? 0
  const chk = () => ((window.__frames ?? 0) >= f0 + n ? res(window.__frames) : requestAnimationFrame(chk))
  chk()
}), n)

await test('addObject accepts a 401st object (cap is missing)', async () => {
  const { ctx, page } = await boot()
  const r = await page.evaluate(() => {
    let guard = 0
    while (window.__world.getState().objects.length < 400 && guard < 450) {
      window.__world.getState().addObject('rock', [0, 1, 0])
      guard++
    }
    const atCap = window.__world.getState().objects.length
    const extra = window.__world.getState().addObject('rock', [2, 1, 0])
    return { atCap, extra, after: window.__world.getState().objects.length, guard }
  })
  assert(r.atCap === 400, 'did not fill to 400 ' + JSON.stringify(r))
  assert(r.extra === '' && r.after === 400, '401st accepted ' + JSON.stringify(r))
  await ctx.close()
})

await test('Ctrl+F does not toggle float on the selected object', async () => {
  const { ctx, page } = await boot()
  await page.evaluate(() => window.__world.getState().select('bench-0'))
  const before = await page.evaluate(() => window.__world.getState().objects.find((o) => o.id === 'bench-0').floating)
  await page.keyboard.press('Control+f')
  const after = await page.evaluate(() => window.__world.getState().objects.find((o) => o.id === 'bench-0').floating)
  assert(before === after, `Ctrl+F changed floating ${before} → ${after}`)
  await ctx.close()
})

await test('second pointer cannot steal an object drag', async () => {
  const { ctx, page } = await boot()
  await frames(page, 2)
  await page.evaluate(() => window.__world.getState().updateObject('bench-0', { pos: [0, 1.2, -18] }))
  await frames(page, 2)
  const hit = await page.evaluate(() => {
    const cam = window.__cam
    cam.updateMatrixWorld()
    const bench = window.__world.getState().objects.find((o) => o.id === 'bench-0')
    const v = { x: bench.pos[0], y: bench.pos[1] + 0.5, z: bench.pos[2] }
    const e = cam.matrixWorldInverse.elements, pe = cam.projectionMatrix.elements
    const vx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]
    const vy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]
    const vz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]
    const cx = pe[0] * vx + pe[4] * vy + pe[8] * vz + pe[12]
    const cy = pe[1] * vx + pe[5] * vy + pe[9] * vz + pe[13]
    const cw = pe[3] * vx + pe[7] * vy + pe[11] * vz + pe[15]
    const r = document.querySelector('.stage canvas').getBoundingClientRect()
    return { x: r.left + (cx / cw * 0.5 + 0.5) * r.width, y: r.top + (-cy / cw * 0.5 + 0.5) * r.height, behind: cw < 0, w: r.width, h: r.height }
  })
  assert(!hit.behind && hit.y > 90 && hit.y < hit.h - 140, 'bench still under UI ' + JSON.stringify(hit))
  await page.mouse.move(hit.x, hit.y)
  await page.mouse.down()
  await frames(page, 1)
  const dragging = await page.evaluate(() => window.__world.getState().dragging)
  assert(dragging, 'no drag at ' + JSON.stringify(hit))
  const pos0 = await page.evaluate(() => window.__world.getState().objects.find((o) => o.id === 'bench-0').pos.slice())
  const stolen = await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 77, clientX: 30, clientY: 40, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, clientX: 30, clientY: 40, bubbles: true }))
    const s = window.__world.getState()
    return { dragging: s.dragging, pos: s.objects.find((o) => o.id === 'bench-0').pos.slice() }
  })
  assert(stolen.dragging, 'foreign pointerup ended the drag')
  const jumped = Math.hypot(stolen.pos[0] - pos0[0], stolen.pos[2] - pos0[2])
  assert(jumped < 0.5, 'foreign pointermove moved the bench by ' + jumped.toFixed(2))
  await page.mouse.up()
  await ctx.close()
})

await test('desktop resize snaps the camera only if the effect actually runs', async () => {
  const { ctx, page } = await boot()
  await frames(page, 2)
  const home = await page.evaluate(() => window.__cam.position.toArray())
  await page.mouse.move(1000, 220)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(1000 - i * 50, 220 + i * 16)
    await frames(page, 1)
  }
  await page.mouse.up()
  await frames(page, 2)
  const moved = await page.evaluate(() => window.__cam.position.toArray())
  const dist = Math.hypot(moved[0] - home[0], moved[1] - home[1], moved[2] - home[2])
  assert(dist > 1.5, 'camera did not move, dist ' + dist.toFixed(2))
  await page.setViewportSize({ width: 1100, height: 760 })
  await page.waitForFunction(() => {
    const r = document.querySelector('.stage canvas')?.getBoundingClientRect()
    return !!r && Math.abs(r.width - 1100) < 3
  }, null, { timeout: 8000 })
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => {
    const p = window.__cam.position.toArray()
    const r = document.querySelector('.stage canvas').getBoundingClientRect()
    return { p, w: r.width, h: r.height }
  })
  const back = Math.hypot(after.p[0] - home[0], after.p[1] - home[1], after.p[2] - home[2])
  console.log('  camera homeΔ after resize', back.toFixed(2), 'canvas', after.w, after.h)
  assert(back > 1, `resize snapped toward home (homeΔ ${back.toFixed(2)}) canvas ${after.w}x${after.h}`)
  await ctx.close()
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
