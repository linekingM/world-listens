// Continuous camera motion stress: the orbit camera moves every frame (full turns, zoom in/out, steep pitch,
// passes close to islands) at golden hour and night; every frame is checked for full / half-screen black.
// Run: node scripts/blacksweep.mjs [q] [frames-per-time]
import { chromium } from 'playwright'
const q = process.argv[2] || 'high', N = +(process.argv[3] || 160)
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 480, height: 300 } })
await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
const p = await ctx.newPage(); const errs = []
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' || /context lost/i.test(m.text())) errs.push(m.text()) })
await p.goto(`http://127.0.0.1:4173/?q=${q}&t=18.3`)
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 300000 })
await p.evaluate(() => { window.__lost = 0; document.querySelector('canvas').addEventListener('webglcontextlost', () => window.__lost++) })
let total = 0, worstFull = 0, worstHalf = 0; const bad = []
for (const t of [18.3, 21.5, 12]) {
  await p.evaluate((t) => window.__world.getState().setTime(t, 'drag'), t)
  const res = await p.evaluate((N) => new Promise((done) => {
    const c = document.querySelector('canvas'), w = 96, h = 60
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const g = cv.getContext('2d', { willReadFrequently: true })
    let i = 0; const out = []
    const tgt = window.__camTarget
    const step = () => {
      const k = i / N
      // full turns + zoom 6..300 m + pitch from grazing to steep, around a target that wanders past the islands
      const yaw = k * Math.PI * 6, r = 6 + (0.5 + 0.5 * Math.sin(k * 17)) * 294, el = 0.03 + (0.5 + 0.5 * Math.sin(k * 11)) * 1.45
      const tx = Math.sin(k * 5) * 60, tz = -60 - Math.cos(k * 3) * 70, ty = 5 + (0.5 + 0.5 * Math.sin(k * 7)) * 40
      if (tgt) tgt.set(tx, ty, tz)
      window.__cam.position.set(tx + r * Math.cos(el) * Math.sin(yaw), ty + r * Math.sin(el), tz + r * Math.cos(el) * Math.cos(yaw))
      window.__cam.lookAt(tx, ty, tz)
      requestAnimationFrame(() => {
        g.drawImage(c, 0, 0, w, h)
        const d = g.getImageData(0, 0, w, h).data
        let all = 0, L = 0, R = 0, T = 0, B = 0
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const j = (y * w + x) * 4
          if (d[j] + d[j + 1] + d[j + 2] < 10) { all++; if (x < w / 2) L++; else R++; if (y < h / 2) T++; else B++ }
        }
        const n = w * h, half = Math.max(L, R, T, B) / (n / 2)
        out.push({ i, full: all / n, half, pos: window.__cam.position.toArray().map((v) => Math.round(v)) })
        if (++i < N) step(); else done(out)
      })
    }
    step()
  }), N)
  for (const f of res) {
    total++
    worstFull = Math.max(worstFull, f.full); worstHalf = Math.max(worstHalf, f.half)
    if (f.full > 0.4 || f.half > 0.7) bad.push({ t, ...f })
  }
  console.log('t', t, 'frames', res.length, 'worst full', worstFull.toFixed(3), 'worst half', worstHalf.toFixed(3), 'bad', bad.length)
}
console.log('TOTAL frames', total, 'bad', bad.length, JSON.stringify(bad.slice(0, 10)))
console.log('context lost', await p.evaluate(() => window.__lost), 'errors', JSON.stringify(errs.slice(0, 5)))
await b.close()
