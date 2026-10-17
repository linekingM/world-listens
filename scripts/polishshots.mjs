import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
const out = 'shots/verify'
mkdirSync(out, { recursive: true })
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const wait = async (p, n) => { const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction(([f0, n]) => window.__frames > f0 + n, [f0, n], { timeout: 300000 }) }

// 1) mobile roam collapsed chip
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint', '1'); localStorage.setItem('world-listens.quality', 'medium') })
  const p = await ctx.newPage()
  await p.goto('http://127.0.0.1:4173/?t=15&q=medium')
  await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 300000 })
  await p.evaluate(() => window.__world.getState().setCamMode('roam'))
  await p.waitForFunction(() => !!window.__roam)
  await wait(p, 10)
  const collapsed = await p.evaluate(() => {
    const el = document.querySelector('[data-testid=roam-hud]')
    return el && el.classList.contains('is-collapsed') && !document.querySelector('[data-testid=roam-keys]')
  })
  console.log('collapsed', collapsed)
  await p.screenshot({ path: `${out}/mobile-roam.png` })
  await ctx.close()
}

// 2) golden-hour sun closeup + behind island
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint', '1'); localStorage.setItem('world-listens.quality', 'medium') })
  const p = await ctx.newPage()
  await p.goto('http://127.0.0.1:4173/?t=17.9&q=medium')
  await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 300000 })
  await p.evaluate(() => window.__world.getState().setCamMode('roam'))
  await p.waitForFunction(() => !!window.__roam)
  // close-up looking at the sun
  await p.evaluate(() => {
    const d = window.__env.sun.dir
    window.__cam.position.set(-d.x * 40, Math.max(8, d.y * 40 + 6), 20 - d.z * 40)
    window.__roam.yaw = Math.atan2(-d.x, -d.z)
    window.__roam.pitch = Math.asin(Math.max(-0.9, Math.min(0.9, d.y)))
    window.__roam.vel.set(0, 0, 0)
  })
  await wait(p, 14)
  const tint = await p.evaluate(() => {
    const c = window.__env.light.sun
    return { r: +c.r.toFixed(3), g: +c.g.toFixed(3), b: +c.b.toFixed(3), elev: +window.__env.sun.elevation.toFixed(1), golden: +window.__env.sun.golden.toFixed(2) }
  })
  console.log('golden tint', JSON.stringify(tint))
  await p.screenshot({ path: `${out}/sun-golden-close.png` })
  // sun behind right island
  const a = await p.evaluate(() => {
    let sun = null
    window.__scene.traverse((o) => { if (o.isDirectionalLight && !sun) sun = o })
    const d = sun.position.clone().sub(sun.target.position).normalize()
    const I = [44, 39, -128], D = 170
    return { I, cam: [I[0] - d.x * D, I[1] - d.y * D, I[2] - d.z * D] }
  })
  await p.evaluate(([pos, at]) => {
    window.__cam.position.set(...pos)
    const dx = at[0] - pos[0], dy = at[1] - pos[1], dz = at[2] - pos[2]
    window.__roam.yaw = Math.atan2(-dx, -dz); window.__roam.pitch = Math.atan2(dy, Math.hypot(dx, dz)); window.__roam.vel.set(0, 0, 0)
  }, [a.cam, a.I])
  await wait(p, 14)
  await p.screenshot({ path: `${out}/a-sun-behind-island.png` })
  // sunset closer to horizon
  await p.evaluate(() => window.__world.getState().setTime(18.8, 'drag'))
  await wait(p, 16)
  await p.evaluate(() => {
    const d = window.__env.sun.dir
    window.__cam.position.set(8, 4, 28)
    window.__roam.yaw = Math.atan2(-d.x, -d.z)
    window.__roam.pitch = Math.asin(Math.max(-0.2, Math.min(0.5, d.y))) * 0.85
    window.__roam.vel.set(0, 0, 0)
  })
  await wait(p, 12)
  const st = await p.evaluate(() => ({ elev: +window.__env.sun.elevation.toFixed(1), golden: +window.__env.sun.golden.toFixed(2), sun: [+window.__env.light.sun.r.toFixed(2), +window.__env.light.sun.g.toFixed(2), +window.__env.light.sun.b.toFixed(2)] }))
  console.log('sunset', JSON.stringify(st))
  await p.screenshot({ path: `${out}/sun-sunset-close.png` })
  await ctx.close()
}
await b.close()
console.log('done')
