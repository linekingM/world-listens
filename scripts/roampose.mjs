import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const roadX = (z) => 7.5 * Math.sin(z * 0.0105 + 0.25) - 1.86 + 3.0 * Math.sin(z * 0.004)
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto(`http://127.0.0.1:4173/?t=${process.argv[2] || 16}`)
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 240000 })
await p.evaluate(() => window.__world.getState().setCamMode('roam'))
await p.waitForFunction(() => !!window.__roam)
const shots = JSON.parse(process.argv[3])
for (const [name, x, y, z, yaw, pitch] of shots) {
  await p.evaluate(([x, y, z, yaw, pitch]) => { window.__cam.position.set(x, y, z); window.__roam.yaw = yaw; window.__roam.pitch = pitch; window.__roam.vel.set(0, 0, 0) }, [x === 'R' ? roadX(z) : x, y, z, yaw, pitch])
  const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction((f0) => window.__frames > f0 + 10, f0, { timeout: 240000 })
  await p.screenshot({ path: `/tmp/v/${name}.png` }); console.log(name)
}
await b.close()
