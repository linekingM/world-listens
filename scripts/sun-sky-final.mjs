import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
const OUT = 'shots/qa-review'
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const wait = async (p, n) => { const f0 = await p.evaluate(() => window.__frames ?? 0); await p.waitForFunction(([f0,n]) => (window.__frames??0) > f0+n, [f0,n], { timeout: 360000 }) }
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint','1'); localStorage.setItem('world-listens.quality','medium') })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/?t=17.9&q=medium')
await page.waitForFunction(() => (window.__frames??0)>20, null, { timeout: 360000 })
await page.evaluate(() => { window.__world.getState().setWeather('clear'); window.__world.getState().setCamMode('roam') })
await page.waitForFunction(() => !!window.__roam)

// High in sky looking straight at sun — no terrain occlusion
async function skySun(time, fov=22) {
  await page.evaluate((t) => window.__world.getState().setTime(t, 'drag'), time)
  await wait(page, 18)
  await page.evaluate((fov) => {
    const d = window.__env.sun.dir
    // camera far opposite the sun, elevated, looking into sun
    window.__cam.position.set(-d.x * 80, Math.max(25, 40 - d.y * 30), 30 - d.z * 80)
    window.__cam.fov = fov
    window.__cam.updateProjectionMatrix()
    window.__roam.yaw = Math.atan2(-d.x, -d.z)
    window.__roam.pitch = Math.asin(Math.max(-0.85, Math.min(0.85, d.y)))
    window.__roam.vel.set(0,0,0)
  }, fov)
  await wait(page, 14)
  return page.evaluate(() => ({
    time:+window.__world.getState().time.toFixed(2),
    elev:+window.__env.sun.elevation.toFixed(2),
    golden:+window.__env.sun.golden.toFixed(3),
    sun:[+window.__env.light.sun.r.toFixed(3),+window.__env.light.sun.g.toFixed(3),+window.__env.light.sun.b.toFixed(3)],
  }))
}

console.log('17', JSON.stringify(await skySun(17.9, 24)))
await page.screenshot({ path: `${OUT}/FINAL-sun-17.png` })
console.log('18', JSON.stringify(await skySun(18.7, 22)))
await page.screenshot({ path: `${OUT}/FINAL-sun-18.png` })
console.log('18t', JSON.stringify(await skySun(18.7, 14)))
await page.screenshot({ path: `${OUT}/FINAL-sun-18-tight.png` })

// day path + default
await page.evaluate(() => {
  window.__world.getState().setTime(11, 'drag')
  window.__cam.fov = 50; window.__cam.updateProjectionMatrix()
  window.__cam.position.set(2, 4, 12)
  window.__roam.yaw = 0; window.__roam.pitch = 0.06; window.__roam.vel.set(0,0,0)
})
await wait(page, 20)
await page.screenshot({ path: `${OUT}/FINAL-day-11-path.png` })
await page.evaluate(() => {
  window.__cam.position.set(8, 15, 38)
  window.__roam.yaw = Math.atan2(4, 118); window.__roam.pitch = Math.atan2(-3, 120)
})
await wait(page, 12)
await page.screenshot({ path: `${OUT}/FINAL-day-11-wide.png` })
await page.evaluate(() => window.__world.getState().setTime(14.9, 'drag'))
await wait(page, 18)
await page.evaluate(() => {
  window.__cam.position.set(2, 4, 12)
  window.__roam.yaw = 0; window.__roam.pitch = 0.06; window.__roam.vel.set(0,0,0)
})
await wait(page, 10)
await page.screenshot({ path: `${OUT}/FINAL-day-15-path.png` })

await b.close()
console.log('final shots done')
