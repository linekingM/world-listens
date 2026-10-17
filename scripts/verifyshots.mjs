// Verification shots: (a) sun behind the right island, (b) waterfall at night, (c) fireflies, (d) 高 daytime wide.
// Run: node scripts/verifyshots.mjs [outDir]
import { chromium } from 'playwright'
const out = process.argv[2] || 'shots/verify'
const only = process.argv[3] || 'abcd'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
async function page(q, t) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message))
  await p.goto(`http://127.0.0.1:4173/?q=${q}&t=${t}`)
  await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 300000 })
  p.wait = async (n) => { const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction(([f0, n]) => window.__frames > f0 + n, [f0, n], { timeout: 300000 }) }
  return p
}
const roam = async (p) => { await p.evaluate(() => window.__world.getState().setCamMode('roam')); await p.waitForFunction(() => !!window.__roam) }
const look = (p, pos, at) => p.evaluate(([pos, at]) => {
  window.__cam.position.set(...pos)
  const dx = at[0] - pos[0], dy = at[1] - pos[1], dz = at[2] - pos[2]
  window.__roam.yaw = Math.atan2(-dx, -dz); window.__roam.pitch = Math.atan2(dy, Math.hypot(dx, dz)); window.__roam.vel.set(0, 0, 0)
}, [pos, at])

// (a) golden hour, sun right behind the right island, seen from near the default camera
let p = await page('medium', 17.9)
await roam(p)
const a = await p.evaluate(() => {
  let sun = null
  window.__scene.traverse((o) => { if (o.isDirectionalLight && !sun) sun = o })
  const d = sun.position.clone().sub(sun.target.position).normalize()
  const I = [44, 39, -128], D = 170
  return { I, cam: [I[0] - d.x * D, I[1] - d.y * D, I[2] - d.z * D] }
})
console.log('a cam', a.cam.map((v) => +v.toFixed(1)))
await look(p, a.cam, a.I); await p.wait(14)
if (only.includes('a')) await p.screenshot({ path: `${out}/a-sun-behind-island.png` })
// (b) waterfall at night: low near the pool, looking up the fall
await p.evaluate(() => window.__world.getState().setTime(21.5, 'drag'))
const foot = await p.evaluate(() => window.__fallFoot)
await look(p, [foot[0] + 16, foot[1] + 3, foot[2] + 20], [foot[0], foot[1] + 9, foot[2]]); await p.wait(14)
await p.screenshot({ path: `${out}/b-waterfall-night.png` })
// (c) fireflies: clear night, normal gravity (萤火之夜), eye level beside the path
await p.evaluate(() => { const s = window.__world.getState(); s.setWeather('clear'); s.setGravity(1); s.setTime(22, 'drag') })
await p.waitForFunction(() => window.__fireflies > 0.6, null, { timeout: 300000 })
await look(p, [6, 3, 26], [2, 2.5, -20]); await p.wait(14)
console.log('fireflies', await p.evaluate(() => window.__fireflies))
await p.screenshot({ path: `${out}/c-fireflies-night.png` })
await p.context().close()
// (d) 高 quality, daytime, default wide view
if (!only.includes('d')) { await b.close(); process.exit(0) }
p = await page('high', 11)
await p.wait(20)
console.log('d trees', await p.evaluate(() => window.__treeSplit.join(',')))
await p.screenshot({ path: `${out}/d-high-day-wide.png` })
await b.close()
