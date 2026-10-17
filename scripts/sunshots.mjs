// Sun behind a floating island at golden hour: full post, no god rays, no bloom. Run: node scripts/sunshots.mjs [out] [port] [tag]
import { chromium } from 'playwright'
const out = process.argv[2] || 'shots/wip', port = process.argv[3] || 4173, tag = process.argv[4] || ''
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1024, height: 640 } })
await ctx.addInitScript(() => { localStorage.setItem('world-listens.hint', '1'); localStorage.setItem('world-listens.quality', 'medium') })
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto(`http://127.0.0.1:${port}/?t=17.9`)
await p.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 240000 })
const wait = async (n) => { const f0 = await p.evaluate(() => window.__frames); await p.waitForFunction(([f0, n]) => window.__frames > f0 + n, [f0, n], { timeout: 240000 }) }
await p.evaluate(() => window.__world.getState().setCamMode('roam'))
await p.waitForFunction(() => !!window.__roam)
// the big island at (-46,31,-104): stand on the far side from the sun, look at it so the sun sits just behind its top
const info = await p.evaluate(() => {
  let sun = null
  window.__scene.traverse((o) => { if (o.isDirectionalLight && !sun) sun = o })
  const d = sun.position.clone().sub(sun.target.position).normalize()
  const I = { x: -46, y: 36, z: -104 }
  const D = 95
  const cam = { x: I.x - d.x * D, z: I.z - d.z * D }
  cam.y = I.y - d.y * D
  window.__cam.position.set(cam.x, cam.y, cam.z)
  const dx = I.x - cam.x, dz = I.z - cam.z, dy = I.y + 2 - cam.y
  window.__roam.yaw = Math.atan2(-dx, -dz); window.__roam.pitch = Math.atan2(dy, Math.hypot(dx, dz)); window.__roam.vel.set(0, 0, 0)
  return { d: d.toArray().map((v) => +v.toFixed(2)), cam }
})
console.log(JSON.stringify(info))
await wait(12)
await p.screenshot({ path: `${out}/sun-island${tag}-full.png` })
const fx = (name, v) => p.evaluate(([name, v]) => {
  for (const pass of window.__composer.passes) for (const e of pass.effects ?? []) {
    if (name === 'god' && 'lightSource' in e || name === 'god' && e.uniforms?.has?.('uSun')) e.blendMode.opacity.value = v
    if (name === 'bloom' && 'luminancePass' in e) e.intensity = v
  }
}, [name, v])
await fx('god', 0); await wait(6)
await p.screenshot({ path: `${out}/sun-island${tag}-nogod.png` })
await fx('god', 1); await fx('bloom', 0); await wait(6)
await p.screenshot({ path: `${out}/sun-island${tag}-nobloom.png` })
await b.close()
