import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const OUT = 'shots/qa-review'
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const wait = async (p, n) => { const f0 = await p.evaluate(() => window.__frames ?? 0); await p.waitForFunction(([f0, n]) => (window.__frames ?? 0) > f0 + n, [f0, n], { timeout: 360000 }) }
const look = (p, pos, at) => p.evaluate(([pos, at]) => {
  window.__cam.position.set(...pos)
  const dx = at[0]-pos[0], dy=at[1]-pos[1], dz=at[2]-pos[2]
  window.__roam.yaw = Math.atan2(-dx,-dz); window.__roam.pitch = Math.atan2(dy, Math.hypot(dx,dz)); window.__roam.vel.set(0,0,0)
}, [pos, at])
async function open(vp, q, opts={}) {
  const ctx = await b.newContext({ viewport: vp, isMobile:!!opts.mobile, hasTouch:!!opts.mobile })
  await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint','1'); localStorage.setItem('world-listens.quality','medium') })
  const page = await ctx.newPage()
  await page.goto(BASE + '/' + q)
  await page.waitForFunction(() => (window.__frames??0)>20, null, { timeout: 360000 })
  return { ctx, page }
}
const meta = existsSync(`${OUT}/meta.json`) ? JSON.parse(readFileSync(`${OUT}/meta.json`,'utf8')) : {}

// 6 clouds drift + day1
{
  const { ctx, page } = await open({width:1280,height:800}, '?t=12&q=medium')
  await page.evaluate(() => window.__world.getState().setCamMode('roam'))
  await page.waitForFunction(() => !!window.__roam)
  await look(page, [0,18,40], [30,40,-80])
  await wait(page, 12)
  const sample = () => page.evaluate(() => {
    let soft=0; const samplePos=[]
    window.__scene?.traverse(o=>{ if(o.type==='Group'&&o.children?.length>2&&o.position.y>30){ soft++; if(samplePos.length<6) samplePos.push([+o.position.x.toFixed(2),+o.position.y.toFixed(2),+o.position.z.toFixed(2)]) }})
    // also sample drei Clouds group positions if any
    let cloudTex=0
    window.__scene?.traverse(o=>{ if(o.material?.map?.image || (o.isMesh&&o.material?.transparent&&o.position.y>20)) cloudTex++ })
    return { day: window.__world.getState().day, soft, samplePos, cloudTex, time: window.__world.getState().time }
  })
  meta.cloudsA = await sample()
  await page.screenshot({ path: `${OUT}/06a-clouds-t0.png` })
  await page.waitForTimeout(4000)
  await wait(page, 10)
  meta.cloudsB = await sample()
  await page.screenshot({ path: `${OUT}/06b-clouds-t4s.png` })
  // pixel diff rough via canvas? skip — visual
  await page.evaluate(() => window.__world.setState({ day: 1 }))
  await wait(page, 30)
  meta.cloudsDay1 = await sample()
  await page.screenshot({ path: `${OUT}/06c-clouds-day1.png` })
  console.log('06', JSON.stringify({a:meta.cloudsA,b:meta.cloudsB,d1:meta.cloudsDay1}))
  await ctx.close()
}

// 7 time play
{
  const { ctx, page } = await open({width:1280,height:800}, '?t=16&q=medium')
  await wait(page, 12)
  meta.playBefore = await page.evaluate(() => {
    const s=window.__world.getState(), e=window.__env
    return { time:+s.time.toFixed(3), rate:s.playRate, elev:+e.sun.elevation.toFixed(2), sun:[+e.light.sun.r.toFixed(3),+e.light.sun.g.toFixed(3),+e.light.sun.b.toFixed(3)], dial:document.querySelector('[data-testid=dial-time]')?.textContent }
  })
  await page.screenshot({ path: `${OUT}/07a-timeplay-before.png` })
  await page.evaluate(() => window.__world.getState().setPlaying(true))
  await page.waitForTimeout(3200)
  await wait(page, 4)
  meta.playAfter = await page.evaluate(() => {
    const s=window.__world.getState(), e=window.__env
    return { time:+s.time.toFixed(3), rate:s.playRate, elev:+e.sun.elevation.toFixed(2), sun:[+e.light.sun.r.toFixed(3),+e.light.sun.g.toFixed(3),+e.light.sun.b.toFixed(3)], dial:document.querySelector('[data-testid=dial-time]')?.textContent }
  })
  await page.screenshot({ path: `${OUT}/07b-timeplay-after.png` })
  meta.playDelta = +(meta.playAfter.time - meta.playBefore.time).toFixed(3)
  console.log('07', JSON.stringify({before:meta.playBefore,after:meta.playAfter,delta:meta.playDelta}))
  await ctx.close()
}

writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2))
await b.close()
console.log('rest done')
