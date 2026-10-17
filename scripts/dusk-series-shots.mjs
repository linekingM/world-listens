import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
const OUT = 'shots/qa-review/phys-sun/dusk-series'
mkdirSync(OUT, { recursive: true })
const TIMES = process.env.TIMES ? process.env.TIMES.split(',').map(Number) : [18, 18.25, 18.5, 18.75, 19, 19.25, 19.5]
const label = (t) => { const h = Math.floor(t), m = Math.round((t - h) * 60); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const wait = async (p, n) => { const f0 = await p.evaluate(() => window.__frames ?? 0); await p.waitForFunction(([f0,n]) => (window.__frames??0) > f0+n, [f0,n], { timeout: 360000 }) }
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint','1'); localStorage.setItem('world-listens.quality','medium') })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/?t=18&q=medium')
await page.waitForFunction(() => (window.__frames??0) > 20, null, { timeout: 360000 })
await page.evaluate(() => { const s = window.__world.getState(); s.setWeather('clear'); s.setCamMode('roam'); s.setSunLook?.({ mode:'auto', warmth:0, hue:0 }) })
await page.waitForFunction(() => !!window.__roam)

// pose: camera at (x0, alt, z0) looking straight at sun (yaw convention verified earlier: forward=(-sin yaw,-cos yaw))
const pose = (x0, alt, z0) => page.evaluate(([x0, alt, z0]) => {
  const d = window.__env.sun.dir
  window.__cam.position.set(x0, alt, z0)
  window.__roam.yaw = Math.atan2(-d.x, -d.z)
  window.__roam.pitch = Math.asin(Math.max(-0.85, Math.min(0.85, d.y)))
  window.__roam.vel.set(0,0,0)
  if (window.__cam.isPerspectiveCamera) { window.__cam.fov = 45; window.__cam.updateProjectionMatrix() }
}, [x0, alt, z0])
const sunScreen = () => page.evaluate(() => {
  const c = window.__cam, d = window.__env.sun.dir
  c.updateMatrixWorld()
  const p = c.position.clone().addScaledVector(d, 50).project(c)
  return { x: Math.round((p.x+1)/2*innerWidth), y: Math.round((1-p.y)/2*innerHeight), z: +p.z.toFixed(3) }
})
async function pixelCheck(sx, sy) {
  const buf = await page.screenshot({ clip: { x: Math.max(0,sx-6), y: Math.max(0,sy-6), width: 13, height: 13 } })
  return buf
}
// candidate vantage points: high & pulled back opposite sun, various lateral offsets
const candidates = []
if (process.env.FIXED) candidates.push({ alt: 45, back: 120, side: -40 }); else for (const alt of [45, 60, 80]) for (const back of [60, 120]) for (const side of [0, -40, 40]) candidates.push({ alt, back, side })

const meta = {}
for (const t of TIMES) {
  const name = `dusk-${label(t).replace(':','-')}`
  await page.evaluate((tt) => window.__world.getState().setTime(tt, 'drag'), t)
  await wait(page, 24)
  let chosen = null
  for (const c of candidates) {
    const d = await page.evaluate(() => { const d = window.__env.sun.dir; return [d.x, d.y, d.z] })
    const hx = d[0], hz = d[2], hl = Math.hypot(hx, hz) || 1
    const px = -hz/hl, pz = hx/hl
    const x0 = -hx/hl*c.back + px*c.side, z0 = -hz/hl*c.back + pz*c.side
    await pose(x0, c.alt, z0)
    await wait(page, 10)
    const ss = await sunScreen()
    const buf = await pixelCheck(ss.x, ss.y)
    // decode via page canvas: simpler — evaluate sampled avg in node with sharp-free approach: write tmp & use python later. Use page to decode PNG:
    const avg = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0)
      const D = g.getImageData(0,0,img.width,img.height).data; let r=0,gg=0,bb=0,n=0
      for (let i=0;i<D.length;i+=4){ r+=D[i]; gg+=D[i+1]; bb+=D[i+2]; n++ }
      return [Math.round(r/n), Math.round(gg/n), Math.round(bb/n)]
    }, buf.toString('base64'))
    const lum = (avg[0]+avg[1]+avg[2])/3
    const inFrame = ss.z < 1 && ss.x > 200 && ss.x < 1080 && ss.y > 120 && ss.y < 640
    const ok = inFrame && lum > (process.env.MINLUM ? +process.env.MINLUM : 185) && avg[0] >= avg[2]
    console.log(name, JSON.stringify(c), JSON.stringify(ss), avg, ok ? 'OK' : 'reject')
    if (ok) { chosen = { cand: c, sunScreen: ss, discAvgRgb: avg, discLum: Math.round(lum) }; break }
  }
  await wait(page, 6)
  meta[name] = await page.evaluate(() => {
    const e = window.__env
    return { time: +window.__world.getState().time.toFixed(2), elev: +e.sun.elevation.toFixed(2), sunLook: window.__sunLook, fogDens: +(window.__scene?.fog?.density||0).toFixed(5),
      cam: { pos: window.__cam.position.toArray().map(n=>+n.toFixed(1)), yaw:+window.__roam.yaw.toFixed(3), pitch:+window.__roam.pitch.toFixed(3), fov: window.__cam.fov } }
  })
  Object.assign(meta[name], chosen ? { verified: true, ...chosen } : { verified: false, note: 'no unoccluded vantage found (sun below horizon/occluded)' })
  await page.screenshot({ path: `${OUT}/${name}.png` })
}
writeFileSync(`${OUT}/${process.env.META || 'meta.json'}`, JSON.stringify(meta, null, 2))
await b.close()
console.log('done')
