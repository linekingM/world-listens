// Usage: node scripts/fps.mjs "?t=8" — frames rendered in 20 s after warm-up (swiftshader: relative numbers only)
import { chromium } from 'playwright'
const q = process.argv[2] || ''
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:4173/' + q)
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 180000 })
const f0 = await p.evaluate(() => window.__frames)
await p.waitForTimeout(20000)
const f1 = await p.evaluate(() => window.__frames)
const info = await p.evaluate(() => {
  let calls = 0, tris = 0
  window.__scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return
    const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3
    const k = o.isInstancedMesh ? o.count : 1
    calls++; tris += n * k
  })
  return [calls, Math.round(tris)]
})
console.log(q, ((f1 - f0) / 20).toFixed(2), 'fps', info ? `calls ${info[0]} tris ${info[1]}` : '')
await b.close()
