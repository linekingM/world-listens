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

async function aimSun(dist = 28) {
  await page.evaluate((dist) => {
    const d = window.__env.sun.dir
    // camera looks straight at sun, closer for bigger disc
    window.__cam.position.set(-d.x * dist, Math.max(2.5, d.y * dist + 1.5), 8 - d.z * dist)
    window.__roam.yaw = Math.atan2(-d.x, -d.z)
    window.__roam.pitch = Math.asin(Math.max(-0.9, Math.min(0.9, d.y)))
    window.__roam.vel.set(0,0,0)
    // also bump FOV tighter for disc readability
    if (window.__cam.isPerspectiveCamera) { window.__cam.fov = 32; window.__cam.updateProjectionMatrix() }
  }, dist)
  await wait(page, 16)
}

async function meta() {
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

await aimSun(30)
console.log('17.9', JSON.stringify(await meta()))
await page.screenshot({ path: `${OUT}/sun-disc-17-golden.png` })

await page.evaluate(() => window.__world.getState().setTime(18.7, 'drag'))
await wait(page, 22)
await aimSun(26)
console.log('18.7', JSON.stringify(await meta()))
await page.screenshot({ path: `${OUT}/sun-disc-18-sunset.png` })

// ultra close
await aimSun(18)
await page.screenshot({ path: `${OUT}/sun-disc-18-close.png` })

// also noon path for sky check in same session
await page.evaluate(() => {
  window.__world.getState().setTime(11, 'drag')
  if (window.__cam.isPerspectiveCamera) { window.__cam.fov = 50; window.__cam.updateProjectionMatrix() }
})
await wait(page, 20)
await page.evaluate(() => {
  window.__cam.position.set(2, 3.5, 10)
  window.__roam.yaw = 0; window.__roam.pitch = 0.05; window.__roam.vel.set(0,0,0)
})
await wait(page, 12)
await page.screenshot({ path: `${OUT}/day-11-path-after-sky.png` })
await page.evaluate(() => window.__world.getState().setTime(14.9, 'drag'))
await wait(page, 18)
await page.screenshot({ path: `${OUT}/day-15-path-after-sky.png` })

await b.close()
console.log('done')
