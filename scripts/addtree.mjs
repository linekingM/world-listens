// Real user flow: 添加 → 树 → click the ground; screenshot before/after (orbit home view).
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
await p.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
await p.goto('http://127.0.0.1:4173/?t=10')
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 240000 })
const frames = async (n) => { const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction(([f0, n]) => window.__frames > f0 + n, [f0, n], { timeout: 120000 }) }
await p.click('[data-testid=rail-add]'); await p.click(`[data-add=${process.argv[2] || 'tree'}]`)
const [x, z] = [13, -8]
const s = await p.evaluate(([x, z]) => { const v = new window.__cam.position.constructor(x, 0, z).project(window.__cam); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight } }, [x, z])
await p.mouse.move(s.x, s.y); await frames(2); await p.mouse.click(s.x, s.y)
await frames(4)
await p.evaluate(() => window.__world.getState().select(null)); await frames(4)
console.log(await p.evaluate(() => window.__world.getState().objects.slice(-1)[0]))
console.log('SCREEN', JSON.stringify(s)); await p.screenshot({ path: '/tmp/v/addtree.png' })
const hide = (v) => p.evaluate(([v, pos]) => { const w = new window.__cam.position.constructor(); window.__scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.getWorldPosition(w); if (Math.hypot(w.x - pos[0], w.z - pos[2]) < 1.5 && o.geometry.attributes.position.count > 100) o.visible = v } }) }, [v, pos])
const pos = await p.evaluate(() => window.__world.getState().objects.slice(-1)[0].pos)
await hide(false); await frames(4); await p.screenshot({ path: '/tmp/v/addtree-hidden.png' })
await b.close()
