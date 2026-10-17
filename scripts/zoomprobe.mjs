import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:4173/?t=10')
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 180000 })
const d = () => p.evaluate(() => [window.__cam.position.distanceTo(window.__camTarget).toFixed(2), window.__camTarget.toArray().map((v) => v.toFixed(1)).join(','), window.__cam.position.toArray().map((v) => v.toFixed(1)).join(',')])
console.log('start', await d())
await p.evaluate(() => { const cam = window.__cam, t = window.__camTarget; const dir = cam.position.clone().sub(t).normalize(); cam.position.copy(t).addScaledVector(dir, 6) })
for (let i = 0; i < 5; i++) { await p.waitForTimeout(1500); console.log(i, await d()) }
await p.mouse.move(640, 400)
for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 400); await p.waitForTimeout(300) }
await p.waitForTimeout(3000); console.log('after zoom-out wheel', await d())
await b.close()
