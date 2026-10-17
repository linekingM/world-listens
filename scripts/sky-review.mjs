import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
const OUT = 'shots/qa-review/sky-fix'
mkdirSync(OUT, { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const wait = async (p, n) => { const f0 = await p.evaluate(() => window.__frames ?? 0); await p.waitForFunction(([f0,n]) => (window.__frames??0) > f0+n, [f0,n], { timeout: 360000 }) }
const look = (p, pos, at) => p.evaluate(([pos, at]) => {
  window.__cam.position.set(...pos)
  const dx=at[0]-pos[0], dy=at[1]-pos[1], dz=at[2]-pos[2]
  window.__roam.yaw = Math.atan2(-dx,-dz); window.__roam.pitch = Math.atan2(dy, Math.hypot(dx,dz)); window.__roam.vel.set(0,0,0)
}, [pos, at])
const sunLook = (p) => p.evaluate(() => {
  const d = window.__env.sun.dir
  window.__cam.position.set(-d.x*42, Math.max(5, d.y*42+3), 16 - d.z*42)
  window.__roam.yaw = Math.atan2(-d.x, -d.z)
  window.__roam.pitch = Math.asin(Math.max(-0.85, Math.min(0.85, d.y)))
  window.__roam.vel.set(0,0,0)
})
const meta = existsSync(`${OUT}/meta.json`) ? JSON.parse(readFileSync(`${OUT}/meta.json`,'utf8')) : {}
async function shot(name, time, view, opts={}) {
  if (existsSync(`${OUT}/${name}.png`) && !opts.force) { console.log('skip', name); return }
  const ctx = await b.newContext({ viewport: opts.vp || { width: 1280, height: 800 }, isMobile: !!opts.mobile, hasTouch: !!opts.mobile })
  await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint','1'); localStorage.setItem('world-listens.quality','medium') })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/?t=${time}&q=medium`)
  await page.waitForFunction(() => (window.__frames??0)>20, null, { timeout: 360000 })
  await page.evaluate(() => { window.__world.getState().setWeather('clear'); window.__world.getState().setCamMode('roam') })
  await page.waitForFunction(() => !!window.__roam)
  if (view === 'default') await look(page, [8,15,38], [-4,12,-80])
  else if (view === 'path') await look(page, [2,3.5,10], [0,4,-100])
  else if (view === 'city') await look(page, [5,22,-200], [0,18,-360])
  else if (view === 'island') await look(page, [50,45,-90], [30,35,-130])
  else if (view === 'sun') await sunLook(page)
  else if (view === 'waterfall') {
    const foot = await page.evaluate(() => window.__fallFoot || [-30,1,-101])
    await look(page, [foot[0]+16, foot[1]+4, foot[2]+20], [foot[0], foot[1]+10, foot[2]])
  }
  await wait(page, 16)
  if (opts.expandDial) {
    await page.click('[data-testid=dial-toggle]')
    await page.waitForSelector('.dial-svg')
    await wait(page, 4)
  }
  meta[name] = await page.evaluate(() => {
    const e = window.__env, s = window.__world.getState()
    const dial = document.querySelector('[data-testid=sun-dial]')
    return {
      time: +s.time.toFixed(2), elev: +e.sun.elevation.toFixed(2), golden: +e.sun.golden.toFixed(3),
      sun: [+e.light.sun.r.toFixed(3), +e.light.sun.g.toFixed(3), +e.light.sun.b.toFixed(3)],
      fog: (() => { const f=window.__scene.fog; return f ? { dens:+f.density.toFixed(5), c:[+f.color.r.toFixed(3),+f.color.g.toFixed(3),+f.color.b.toFixed(3)] } : null })(),
      dialOpen: dial?.getAttribute('data-open'), dialClass: dial?.className, hasSvg: !!document.querySelector('.dial-svg'),
    }
  })
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, JSON.stringify(meta[name]))
  await ctx.close()
}

await shot('11-noon-path', 11, 'path', { force: true })
await shot('11-noon-default', 11, 'default', { force: true })
await shot('14-afternoon-path', 14.9, 'path')
await shot('14-afternoon-city', 14.9, 'city')
await shot('17-golden-sun', 17.9, 'sun')
await shot('17-golden-path', 17.9, 'path')
await shot('18-sunset-sun', 18.7, 'sun')
await shot('18-sunset-island', 18.7, 'island')
await shot('22-night-path', 22, 'path')
await shot('14-waterfall-day', 14, 'waterfall')
await shot('22-waterfall-night', 22, 'waterfall')
await shot('dial-collapsed', 15, 'path', { force: true })
await shot('dial-expanded', 15, 'path', { force: true, expandDial: true })
await shot('mobile-dial', 15, 'path', { force: true, mobile: true, vp: { width: 390, height: 844 } })

writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2))
await b.close()
console.log('sky-review done')
