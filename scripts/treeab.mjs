// Decisive check that a placed object renders: same page, same camera, object shown vs hidden.
import { chromium } from 'playwright'
const type = process.argv[2] || 'tree'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
await p.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
await p.goto('http://127.0.0.1:4173/?t=12' + (process.argv[3] || ''))
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 240000 })
const frames = async (n) => { const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction(([f0, n]) => window.__frames > f0 + n, [f0, n], { timeout: 120000 }) }
await p.evaluate(([type, sel]) => { const s = window.__world.getState(); s.setWeather('clear'); const id = s.addObject(type, [9, 0, 30]); s.select(sel ? id : null); s.setCamMode('roam') }, [type, !!process.env.SEL])
await p.waitForFunction(() => !!window.__roam)
await p.evaluate(() => { window.__cam.position.set(9, 2, 41); window.__roam.yaw = 0; window.__roam.pitch = 0.12; window.__roam.vel.set(0, 0, 0); window.__fxUniforms && (window.__fxUniforms.uWind.value = 0) })
await frames(8)
await p.screenshot({ path: `/tmp/v/ab-${type}-on.png` })
const n = await p.evaluate(() => { let n = 0; const w = new window.__cam.position.constructor(); window.__scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.getWorldPosition(w); if (Math.hypot(w.x - 9, w.z - 30) < 1 && o.geometry.attributes.position.count > 100) { o.visible = false; n++ } } }); return n })
await frames(4)
await p.screenshot({ path: `/tmp/v/ab-${type}-off.png` })
console.log('hidden meshes', n)
await b.close()
