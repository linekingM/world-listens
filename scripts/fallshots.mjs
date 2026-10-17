// Waterfall check: night / sunset / noon, default view (cropped) + close roam at the landing pool.
// Run: node scripts/fallshots.mjs [outDir]
import { chromium } from 'playwright'
const out = process.argv[2] || 'shots/wip'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint', '1'); localStorage.setItem('world-listens.quality', 'medium') })
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto('http://127.0.0.1:4173/?t=21.5')
await p.waitForFunction(() => (window.__frames ?? 0) > 20 && window.__fallFoot, null, { timeout: 240000 })
const foot = await p.evaluate(() => window.__fallFoot)
console.log('foot', foot.map((v) => +v.toFixed(1)))
const wait = async (n) => { const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction(([f0, n]) => window.__frames > f0 + n, [f0, n], { timeout: 240000 }) }
for (const [name, t] of [['night', 21.5], ['sunset', 18.3], ['noon', 12.5]]) {
  await p.evaluate((t) => window.__world.getState().setTime(t, 'drag'), t)
  if (name !== 'night') await p.evaluate(() => window.__world.getState().setCamMode('orbit'))
  await wait(12)
  await p.screenshot({ path: `${out}/fall-${name}-default.png` })
  await p.evaluate(() => window.__world.getState().setCamMode('roam'))
  await p.waitForFunction(() => !!window.__roam)
  // stand ~24 m from the pool, eye level, looking at it and up the fall
  await p.evaluate(([fx, fy, fz]) => { const x = fx + 20, z = fz + 14; window.__cam.position.set(x, fy + 2, z); window.__roam.yaw = Math.atan2(x - fx, z - fz); window.__roam.pitch = 0.22; window.__roam.vel.set(0, 0, 0) }, foot)
  await wait(12)
  await p.screenshot({ path: `${out}/fall-${name}-roam.png` })
}
await b.close()
