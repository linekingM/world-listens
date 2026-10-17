// Default-view lighting check. Usage: TAG=before|after node scripts/sun-path-shots.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
const TAG = process.env.TAG || 'after'
const OUT = `shots/qa-review/sun-path/${TAG}`
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const wait = async (p, n) => { const f0 = await p.evaluate(() => window.__frames ?? 0); await p.waitForFunction(([f0,n]) => (window.__frames??0) > f0+n, [f0,n], { timeout: 360000 }) }
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint','1'); localStorage.setItem('world-listens.quality','medium') })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/?t=9&q=medium')
await page.waitForFunction(() => (window.__frames??0) > 30, null, { timeout: 360000 })
await page.evaluate(() => { const s = window.__world.getState(); s.setWeather('clear'); s.setSunLook?.({ mode:'auto', warmth:0, hue:0 }) })
const meta = {}
for (const t of [9, 12, 15, 17.5]) {
  await page.evaluate((tt) => window.__world.getState().setTime(tt, 'drag'), t)
  await wait(page, 30)
  const name = `default-${String(t).replace('.', '_')}`
  meta[name] = await page.evaluate(() => ({ time: window.__world.getState().time, elev: +window.__env.sun.elevation.toFixed(2), dir: window.__env.sun.dir.toArray().map(n=>+n.toFixed(3)), cam: window.__cam.position.toArray().map(n=>+n.toFixed(1)) }))
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, JSON.stringify(meta[name]))
}
// sunset turned toward the sun (roam), 18:45
await page.evaluate(() => window.__world.getState().setCamMode('roam'))
await page.waitForFunction(() => !!window.__roam)
await page.evaluate(() => window.__world.getState().setTime(18.75, 'drag'))
await wait(page, 30)
await page.evaluate(() => {
  const d = window.__env.sun.dir
  window.__cam.position.set(8, 45, 38)
  window.__roam.yaw = Math.atan2(-d.x, -d.z); window.__roam.pitch = Math.asin(Math.max(-0.85, Math.min(0.85, d.y))) - 0.05
  window.__roam.vel.set(0,0,0)
})
await wait(page, 20)
meta['sunset-18_45-turned'] = await page.evaluate(() => {
  const c = window.__cam, d = window.__env.sun.dir; c.updateMatrixWorld()
  const p = c.position.clone().addScaledVector(d, 50).project(c)
  return { elev: +window.__env.sun.elevation.toFixed(2), dir: d.toArray().map(n=>+n.toFixed(3)), yawDeg: +(window.__roam.yaw*180/Math.PI).toFixed(1), sunScreen: { x: Math.round((p.x+1)/2*innerWidth), y: Math.round((1-p.y)/2*innerHeight) } }
})
await page.screenshot({ path: `${OUT}/sunset-18_45-turned.png` })
console.log('sunset', JSON.stringify(meta['sunset-18_45-turned']))
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2))
await b.close(); console.log('done')
