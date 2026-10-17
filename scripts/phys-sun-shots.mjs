import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
const OUT = 'shots/qa-review/phys-sun'
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const wait = async (p, n) => { const f0 = await p.evaluate(() => window.__frames ?? 0); await p.waitForFunction(([f0,n]) => (window.__frames??0) > f0+n, [f0,n], { timeout: 360000 }) }
const sunAim = (p, dist=36) => p.evaluate((dist) => {
  const d = window.__env.sun.dir
  window.__cam.position.set(-d.x*dist, Math.max(3, d.y*dist+2), 12 - d.z*dist)
  window.__roam.yaw = Math.atan2(-d.x, -d.z)
  window.__roam.pitch = Math.asin(Math.max(-0.85, Math.min(0.85, d.y)))
  window.__roam.vel.set(0,0,0)
  if (window.__cam.isPerspectiveCamera) { window.__cam.fov = 38; window.__cam.updateProjectionMatrix() }
}, dist)
const pathLook = (p) => p.evaluate(() => {
  window.__cam.position.set(2, 3.5, 10)
  window.__roam.yaw = 0; window.__roam.pitch = 0.08; window.__roam.vel.set(0,0,0)
  if (window.__cam.isPerspectiveCamera) { window.__cam.fov = 50; window.__cam.updateProjectionMatrix() }
})
const meta = {}
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint','1'); localStorage.setItem('world-listens.quality','medium') })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/?t=15&q=medium')
await page.waitForFunction(() => (window.__frames??0)>20, null, { timeout: 360000 })
await page.evaluate(() => {
  window.__world.getState().setWeather('clear')
  window.__world.getState().setCamMode('roam')
  // ensure auto sunLook
  window.__world.getState().setSunLook?.({ mode: 'auto', warmth: 0, hue: 0 })
})
await page.waitForFunction(() => !!window.__roam)

async function snap(name, time, view) {
  await page.evaluate((t) => window.__world.getState().setTime(t, 'drag'), time)
  await wait(page, 20)
  if (view === 'sun') await sunAim(page, time >= 18 ? 28 : 40)
  else await pathLook(page)
  await wait(page, 14)
  meta[name] = await page.evaluate(() => {
    const e = window.__env
    const sl = window.__sunLook
    return {
      time: +window.__world.getState().time.toFixed(2),
      elev: +e.sun.elevation.toFixed(2),
      golden: +e.sun.golden.toFixed(3),
      sunLook: sl,
      fogDens: +(window.__scene?.fog?.density || 0).toFixed(5),
      weather: window.__world.getState().weather,
    }
  })
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, JSON.stringify(meta[name]))
}

await snap('07-dawn-sun', 7.0, 'sun')
await snap('07-dawn-path', 7.0, 'path')
await snap('15-afternoon-sun', 15.05, 'sun')
await snap('15-afternoon-path', 15.05, 'path')
await snap('18-late-sun', 18.0, 'sun')
await snap('18-late-path', 18.0, 'path')
await snap('18-40-sunset-sun', 18.67, 'sun')
await snap('18-40-sunset-path', 18.67, 'path')

// misty dawn haze check
await page.evaluate(() => window.__world.getState().setWeather('mist'))
await snap('07-mist-path', 7.0, 'path')
await page.evaluate(() => window.__world.getState().setWeather('clear'))

writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2))
await b.close()
console.log('done')
