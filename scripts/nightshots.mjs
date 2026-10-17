// Night check: wide default view with fireflies + moonlit path, path-level view, dimmed waterfall. node scripts/nightshots.mjs [out]
import { chromium } from 'playwright'
const out = process.argv[2] || 'shots/verify'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto('http://127.0.0.1:4173/?q=medium&t=20.5')
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 300000 })
const wait = async (n) => { const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction(([f0, n]) => window.__frames > f0 + n, [f0, n], { timeout: 300000 }) }
await p.evaluate(() => { const s = window.__world.getState(); s.setWeather('clear'); s.setGravity(1); s.setTime(22, 'drag') })
await p.waitForFunction(() => window.__fireflies > 0.8, null, { timeout: 300000 })
await wait(10)
await p.screenshot({ path: `${out}/fireflies-wide-night.png` })
await p.evaluate(() => window.__world.getState().setCamMode('roam'))
await p.waitForFunction(() => !!window.__roam)
const look = (pos, at) => p.evaluate(([pos, at]) => {
  window.__cam.position.set(...pos)
  const dx = at[0] - pos[0], dy = at[1] - pos[1], dz = at[2] - pos[2]
  window.__roam.yaw = Math.atan2(-dx, -dz); window.__roam.pitch = Math.atan2(dy, Math.hypot(dx, dz)); window.__roam.vel.set(0, 0, 0)
}, [pos, at])
await look([2, 3, 0], [0, 2, -80]); await wait(12)
await p.screenshot({ path: `${out}/fireflies-path-night.png` })
const foot = await p.evaluate(() => window.__fallFoot)
await look([foot[0] + 16, foot[1] + 3, foot[2] + 20], [foot[0], foot[1] + 9, foot[2]]); await wait(12)
await p.screenshot({ path: `${out}/b-waterfall-night.png` })
await b.close()
