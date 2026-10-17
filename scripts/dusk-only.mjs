import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
const OUT = '/workspace/world-listens/shots/qa-review'
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
const sunLook = async () => {
  await page.evaluate(() => {
    const d = window.__env.sun.dir
    window.__cam.position.set(-d.x*38, Math.max(4, d.y*38+2), 12 - d.z*38)
    window.__roam.yaw = Math.atan2(-d.x, -d.z)
    window.__roam.pitch = Math.asin(Math.max(-0.85, Math.min(0.85, d.y)))
    window.__roam.vel.set(0,0,0)
  })
  await wait(page, 14)
}
await sunLook()
const info = async () => page.evaluate(() => {
  const e=window.__env
  return { time:+window.__world.getState().time.toFixed(2), elev:+e.sun.elevation.toFixed(2), golden:+e.sun.golden.toFixed(3), sun:[+e.light.sun.r.toFixed(3),+e.light.sun.g.toFixed(3),+e.light.sun.b.toFixed(3)] }
})
console.log('17.9', JSON.stringify(await info()))
await page.screenshot({ path: `${OUT}/dusk-NOW-17-golden-sun.png` })
await page.evaluate(() => window.__world.getState().setTime(18.7, 'drag'))
await wait(page, 20)
await sunLook()
console.log('18.7', JSON.stringify(await info()))
await page.screenshot({ path: `${OUT}/dusk-NOW-18-sunset-sun.png` })
// path view at sunset
await page.evaluate(() => {
  window.__cam.position.set(2, 3.5, 10)
  window.__roam.yaw = Math.atan2(0, 100); window.__roam.pitch = Math.atan2(0.5, 100); window.__roam.vel.set(0,0,0)
})
await wait(page, 10)
await page.screenshot({ path: `${OUT}/dusk-NOW-18-sunset-path.png` })
await b.close()
console.log('dusk NOW shots ready')
