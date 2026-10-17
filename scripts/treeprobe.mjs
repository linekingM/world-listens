import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('CERR', m.text()))
await p.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
await p.goto('http://127.0.0.1:4173/?t=10' + (process.argv[2] || ''))
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 240000 })
await p.evaluate(() => { const s = window.__world.getState(); s.select(s.addObject('tree', [6, 0, 20])) })
const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction((f0) => window.__frames > f0 + 8, f0, { timeout: 120000 })
await p.evaluate(() => { const v = new window.__cam.position.constructor(); window.__drawn = []; window.__scene.traverse((o) => { if (!o.isMesh || o.isInstancedMesh) return; o.getWorldPosition(v); if (Math.hypot(v.x - 6, v.z - 20) < 3) { const i = window.__drawn.length; window.__drawn.push(0); o.onAfterRender = () => { window.__drawn[i]++ } } }) })
const f1 = await p.evaluate(() => window.__frames); await p.waitForFunction((f1) => window.__frames > f1 + 4, f1, { timeout: 120000 })
console.log('drawn', await p.evaluate(() => window.__drawn), await p.evaluate(() => { const r = []; window.__scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && [5618, 3840].includes(o.geometry.attributes.position.count) && o.material.type === "MeshStandardMaterial") r.push({ n: o.geometry.attributes.position.count, name: o.material.name, ctr: o.geometry.boundingSphere?.center.toArray().map((x) => +x.toFixed(2)), wp: o.getWorldPosition(new window.__cam.position.constructor()).toArray().map((x) => +x.toFixed(1)), ws: +o.getWorldScale(new window.__cam.position.constructor()).x.toFixed(3), op: o.material.opacity, tr: o.material.transparent, fc: o.frustumCulled, bs: o.geometry.boundingSphere && [o.geometry.boundingSphere.radius.toFixed(2), o.geometry.boundingSphere.center.toArray().map((x) => x.toFixed(1))], pos0: o.geometry.attributes.position.array.slice(0, 3), type: o.geometry.attributes.position.array.constructor.name, vis: o.material.visible, side: o.material.side, cw: o.material.colorWrite, at: o.material.alphaTest }) }); return r }))
console.log(JSON.stringify(await p.evaluate(() => {
  const out = []; const v = new window.__cam.position.constructor()
  window.__scene.traverse((o) => { if (!o.isMesh || o.isInstancedMesh) return; o.getWorldPosition(v); if (Math.hypot(v.x - 6, v.z - 20) < 3) { let vis = true; for (let q = o; q; q = q.parent) if (!q.visible) vis = false; out.push({ t: o.geometry.type, n: o.geometry.attributes.position.count, vis, y: +v.y.toFixed(2), sc: +o.getWorldScale(v.clone()).x.toFixed(3), mat: o.material.type, op: o.material.opacity }) } })
  return out
})))
await b.close()
