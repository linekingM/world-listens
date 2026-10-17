// Black-frame hunt: scan geometry for NaN / zero normals, then sweep the camera (orbit + roam) over many angles,
// heights and times, measuring the near-black pixel fraction of each frame. Run: node scripts/blackprobe.mjs [port] [q]
import { chromium } from 'playwright'
const port = process.argv[2] || 4173, q = process.argv[3] || 'medium'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 640, height: 400 } })
await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
const p = await ctx.newPage()
const logs = []
p.on('console', (m) => { if (/context|nan|error/i.test(m.text())) logs.push(m.text()) })
p.on('pageerror', (e) => logs.push('ERR ' + e.message))
await p.goto(`http://127.0.0.1:${port}/?q=${q}&t=12`)
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 240000 })
await p.evaluate(() => { window.__lost = 0; document.querySelector('canvas').addEventListener('webglcontextlost', () => window.__lost++) })
const geo = await p.evaluate(() => {
  const out = { geos: 0, nanPos: [], zeroN: [], nanN: [] }
  const seen = new Set()
  window.__scene.traverse((o) => {
    const g = o.geometry; if (!g || seen.has(g)) return; seen.add(g); out.geos++
    const P = g.attributes.position, N = g.attributes.normal
    if (P && !P.normalized) for (let i = 0; i < P.array.length; i++) if (!Number.isFinite(P.array[i])) { out.nanPos.push(o.name || o.type); break }
    if (N && !N.normalized) {
      let z = 0, n = 0
      for (let i = 0; i < N.count; i++) { const x = N.getX(i), y = N.getY(i), w = N.getZ(i); if (!Number.isFinite(x + y + w)) n++; else if (x * x + y * y + w * w < 1e-8) z++ }
      if (z) out.zeroN.push(`${o.name || o.type}:${z}/${N.count}`)
      if (n) out.nanN.push(`${o.name || o.type}:${n}`)
    }
  })
  return out
})
console.log('geometry', JSON.stringify(geo))
const black = () => p.evaluate(() => {
  const c = document.querySelector('canvas'), w = 160, h = 100
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const g = cv.getContext('2d'); g.drawImage(c, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h).data; let k = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 12) k++
  return k / (w * h)
})
const wait = async (n) => { const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction(([f0, n]) => window.__frames > f0 + n, [f0, n], { timeout: 120000 }) }
let worst = 0, bad = []
await p.evaluate(() => window.__world.getState().setCamMode('roam'))
await p.waitForFunction(() => !!window.__roam)
for (const t of [6.4, 12, 18.3, 21.5]) {
  await p.evaluate((t) => window.__world.getState().setTime(t, 'drag'), t)
  for (const [y, pitch] of [[2, 0.0], [2, -0.03], [60, -0.02], [140, -0.12], [8, 1.2], [8, -1.45]]) {
    for (let yaw = 0; yaw < 6.28; yaw += 0.785) {
      await p.evaluate(([y, yaw, pitch]) => { window.__cam.position.set(4, y, 30); window.__roam.yaw = yaw; window.__roam.pitch = pitch; window.__roam.vel.set(0, 0, 0) }, [y, yaw, pitch])
      await wait(2)
      const k = await black()
      if (k > worst) worst = k
      if (k > 0.15) bad.push({ t, y, pitch, yaw: +yaw.toFixed(2), black: +k.toFixed(2) })
    }
  }
  console.log('t', t, 'worst so far', worst.toFixed(3), 'bad', bad.length)
}
console.log('bad frames', JSON.stringify(bad.slice(0, 20)))
console.log('lost', await p.evaluate(() => window.__lost), 'logs', JSON.stringify(logs.slice(0, 8)))
await b.close()
