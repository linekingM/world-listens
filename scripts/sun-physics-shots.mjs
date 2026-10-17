// Usage: BASE=http://127.0.0.1:4173 OUT=shots/qa-review/sun-physics ONLY_HERO=0 node scripts/sun-physics-shots.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const OUT = process.env.OUT || 'shots/qa-review/sun-physics'
const ONLY_HERO = process.env.ONLY_HERO === '1'
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const wait = async (p, n) => { const f0 = await p.evaluate(() => window.__frames ?? 0); await p.waitForFunction(([f0,n]) => (window.__frames??0) > f0+n, [f0,n], { timeout: 360000 }) }
const meta = {}
async function newPage(t) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint','1'); localStorage.setItem('world-listens.quality','medium') })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/?t=${t}&q=medium`)
  await page.waitForFunction(() => (window.__frames??0) > 30, null, { timeout: 360000 })
  await page.evaluate(() => { const s = window.__world.getState(); s.setWeather('clear'); s.setSunLook?.({ mode:'auto', warmth:0, hue:0 }) })
  return page
}
const info = (page) => page.evaluate(() => ({ time: +window.__world.getState().time.toFixed(2), elev: +window.__env.sun.elevation.toFixed(2), dir: window.__env.sun.dir.toArray().map(n=>+n.toFixed(3)), sunLook: window.__sunLook }))
async function setT(page, t) { await page.evaluate((tt) => window.__world.getState().setTime(tt, 'drag'), t); await wait(page, 28) }

// A: default-view shots (orbit hero)
const A = await newPage(9)
const hero = ONLY_HERO ? [18.75] : [15]
for (const t of hero) {
  await setT(A, t)
  const name = t === 18.75 ? 'hero-18_45' : `default-${t}`
  meta[name] = await info(A); await A.screenshot({ path: `${OUT}/${name}.png` }); console.log(name, JSON.stringify(meta[name]))
}
if (!ONLY_HERO) {
  // B: sun-facing views from an open high vantage
  await A.evaluate(() => window.__world.getState().setCamMode('roam'))
  await A.waitForFunction(() => !!window.__roam)
  for (const t of [18.5, 19.25]) {
    await setT(A, t)
    await A.evaluate(() => {
      const d = window.__env.sun.dir, hl = Math.hypot(d.x, d.z) || 1
      window.__cam.position.set(8 - d.x/hl*60, 45, 38 - d.z/hl*60)
      window.__roam.yaw = Math.atan2(-d.x, -d.z); window.__roam.pitch = Math.max(-0.1, Math.asin(Math.max(-0.85, Math.min(0.85, d.y)))) + 0.06
      window.__roam.vel.set(0,0,0)
      if (window.__cam.isPerspectiveCamera) { window.__cam.fov = 55; window.__cam.updateProjectionMatrix() }
    })
    await wait(A, 18)
    const hh = Math.floor(t), mm = Math.round((t - hh) * 60)
    const name = `sun-${hh}_${String(mm).padStart(2,'0')}`
    meta[name] = await info(A); await A.screenshot({ path: `${OUT}/${name}.png` }); console.log(name, JSON.stringify(meta[name]))
  }
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2))
await b.close(); console.log('done')
