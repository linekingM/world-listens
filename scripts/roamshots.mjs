// Free-roam screenshots: walking near the city gate, hovering beside an island, mobile joystick.
// Run: node scripts/roamshots.mjs [outDir]  (preview on 127.0.0.1:4173)
import { chromium } from 'playwright'
const out = process.argv[2] || 'shots/roam'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const roadX = (z) => 7.5 * Math.sin(z * 0.0105 + 0.25) - 1.86 + 3.0 * Math.sin(z * 0.004)
async function page(opts, t) {
  const ctx = await b.newContext(opts)
  await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('ERR', e.message))
  await p.goto(`http://127.0.0.1:4173/?t=${t}`)
  await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 240000 })
  await p.evaluate(() => window.__world.getState().setCamMode('roam'))
  await p.waitForFunction(() => !!window.__roam, null, { timeout: 60000 })
  return p
}
async function place(p, pos, yaw, pitch) {
  await p.evaluate(([pos, yaw, pitch]) => {
    window.__cam.position.set(...pos); window.__roam.yaw = yaw; window.__roam.pitch = pitch; window.__roam.vel.set(0, 0, 0)
  }, [pos, yaw, pitch])
  const f0 = await p.evaluate(() => window.__frames)
  await p.waitForFunction((f0) => window.__frames > f0 + 10, f0, { timeout: 240000 })
  console.log('cam', await p.evaluate(() => window.__cam.position.toArray().map((v) => +v.toFixed(1))))
}
// 1. walking up the avenue towards the city gate (ground collision lifts y to eye height)
let p = await page({ viewport: { width: 1280, height: 800 } }, 17)
const gz = -262
await place(p, [roadX(gz), 0, gz], 0.04, 0.06)
await p.screenshot({ path: `${out}/roam-city-gate.png` })
// 2. hovering beside the waterfall island
await place(p, [-18, 33, -84], Math.atan2(28, 20), -0.06)
await p.screenshot({ path: `${out}/roam-island.png` })
await p.context().close()
// 3. mobile: joystick held forward on the flagstone path
p = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 10)
await place(p, [roadX(10), 0, 10], 0.1, -0.05)
await p.evaluate(() => { window.__roam.input.joyY = 0.8 })
const f0 = await p.evaluate(() => window.__frames)
await p.waitForFunction((f0) => window.__frames > f0 + 6, f0, { timeout: 240000 })
await p.screenshot({ path: `${out}/roam-mobile.png` })
console.log('mobile cam', await p.evaluate(() => window.__cam.position.toArray().map((v) => +v.toFixed(1))))
await b.close()
