import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto('http://127.0.0.1:5173/?style=a&t=' + (process.argv[2] || '18.5'))
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 120000 })
console.log(await p.evaluate(() => {
  const e = window.__env, c = window.__cam
  const v = e.sun.dir.clone().multiplyScalar(1000).add(c.position).project(c)
  return JSON.stringify({ elev: e.sun.elevation, time: e.time, dir: e.sun.dir, ndc: [v.x, v.y, v.z], cam: c.position, fov: c.fov })
}))
await b.close()
