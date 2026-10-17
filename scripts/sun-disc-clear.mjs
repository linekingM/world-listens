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

async function clearSunView(time) {
  await page.evaluate((t) => window.__world.getState().setTime(t, 'drag'), time)
  await wait(page, 20)
  await page.evaluate(() => {
    const d = window.__env.sun.dir
    const sx = -d.z, sz = d.x
    const len = Math.hypot(sx, sz) || 1
    const ox = (sx / len) * 40, oz = (sz / len) * 40
    const dist = 60
    const cx = -d.x * dist + ox
    const cy = Math.max(10, -d.y * dist + 14)
    const cz = 25 - d.z * dist + oz
    window.__cam.position.set(cx, cy, cz)
    window.__cam.fov = 26
    window.__cam.updateProjectionMatrix()
    const dx = d.x * 80, dy = d.y * 80, dz = d.z * 80
    window.__roam.yaw = Math.atan2(-dx, -dz)
    window.__roam.pitch = Math.atan2(dy, Math.hypot(dx, dz))
    window.__roam.vel.set(0, 0, 0)
  })
  await wait(page, 16)
  return page.evaluate(() => {
    const e = window.__env
    return {
      time: +window.__world.getState().time.toFixed(2),
      elev: +e.sun.elevation.toFixed(2),
      golden: +e.sun.golden.toFixed(3),
      sun: [+e.light.sun.r.toFixed(3), +e.light.sun.g.toFixed(3), +e.light.sun.b.toFixed(3)],
    }
  })
}

console.log('17.9', JSON.stringify(await clearSunView(17.9)))
await page.screenshot({ path: `${OUT}/sun-CLEAR-17.png` })
console.log('18.7', JSON.stringify(await clearSunView(18.7)))
await page.screenshot({ path: `${OUT}/sun-CLEAR-18.png` })
await page.evaluate(() => { window.__cam.fov = 16; window.__cam.updateProjectionMatrix() })
await wait(page, 10)
await page.screenshot({ path: `${OUT}/sun-CLEAR-18-tight.png` })

await page.evaluate(() => {
  window.__world.getState().setTime(11, 'drag')
  window.__cam.fov = 50; window.__cam.updateProjectionMatrix()
  window.__cam.position.set(2, 4, 12)
  window.__roam.yaw = 0; window.__roam.pitch = 0.08; window.__roam.vel.set(0, 0, 0)
})
await wait(page, 20)
await page.screenshot({ path: `${OUT}/day-CLEAR-11.png` })
await page.evaluate(() => window.__world.getState().setTime(14.9, 'drag'))
await wait(page, 18)
await page.screenshot({ path: `${OUT}/day-CLEAR-15.png` })

await b.close()
console.log('clear shots done')
