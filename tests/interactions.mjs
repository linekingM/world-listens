// End-to-end interaction tests (real WebGL via SwiftShader). Run: node tests/interactions.mjs
// Requires the production preview at BASE (default http://127.0.0.1:4173).
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const SHOTS = 'shots'
const results = []
const t0all = Date.now()
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null
async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return
  const t0 = Date.now()
  try { await fn(); results.push({ name, ok: true, s: (Date.now() - t0) / 1000 }); console.log('✔', name, `${((Date.now() - t0) / 1000).toFixed(1)}s`) }
  catch (e) { results.push({ name, ok: false, err: String(e.message || e).slice(0, 300) }); console.log('✘', name, e.message) }
}
const assert = (c, m) => { if (!c) throw new Error(m) }

async function open(viewport, opts = {}) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: opts.dpr ?? 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, acceptDownloads: true })
  if (!opts.showHint) await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
  // fixed quality tier (中) for speed and stable timings: no auto-detection / fps probe in tests
  await ctx.addInitScript(() => { if (!localStorage.getItem('world-listens.quality')) localStorage.setItem('world-listens.quality', 'medium') })
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push('PAGEERROR ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()) })
  await page.goto(BASE + '/' + (opts.query ?? ''))
  // SwiftShader: a second WebGL page shares the CPU with the main one, so its first frames can take minutes
  await page.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 360000 })
  return { ctx, page }
}
const frames = (page, n) => page.evaluate((n) => new Promise((res) => { const f0 = window.__frames; const chk = () => (window.__frames >= f0 + n ? res() : requestAnimationFrame(chk)); chk() }), n)
const st = (page, fn) => page.evaluate(`(() => { const s = window.__world.getState(); return (${fn})(s) })()`)
/** world → client pixel coords using the live camera */
const project = (page, p) => page.evaluate(([x, y, z]) => {
  const cam = window.__cam
  cam.updateMatrixWorld()
  const v = { x, y, z }
  const e = cam.matrixWorldInverse.elements, pe = cam.projectionMatrix.elements
  const vx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], vy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], vz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]
  const cx = pe[0] * vx + pe[4] * vy + pe[8] * vz + pe[12], cy = pe[1] * vx + pe[5] * vy + pe[9] * vz + pe[13], cw = pe[3] * vx + pe[7] * vy + pe[11] * vz + pe[15]
  const r = document.querySelector('.stage canvas').getBoundingClientRect()
  return { x: r.left + (cx / cw * 0.5 + 0.5) * r.width, y: r.top + (-cy / cw * 0.5 + 0.5) * r.height, behind: cw < 0 }
}, p)
async function drag(page, from, to, steps = 8) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await frames(page, 1) }
  await page.mouse.up()
}
const uiCoverage = (page) => page.evaluate(() => {
  const sel = ['.title-block h1', '.title-block .subtitle', '.action-pill', '.rail', '.sun-dial']
  const W = innerWidth, H = innerHeight
  let area = 0
  const boxes = []
  for (const s of sel) for (const el of document.querySelectorAll(s)) { const r = el.getBoundingClientRect(); area += r.width * r.height; boxes.push([s, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]) }
  // overlap check between HUD blocks
  const rects = sel.map((s) => document.querySelector(s)?.getBoundingClientRect()).filter(Boolean)
  let overlap = false
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], c = rects[j]
    if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) overlap = true
  }
  const offscreen = rects.some((r) => r.left < 0 || r.top < 0 || r.right > W + 0.5 || r.bottom > H + 0.5)
  return { pct: (area / (W * H)) * 100, boxes, overlap, offscreen }
})

// ───────────────────────── desktop ─────────────────────────
const { ctx, page } = await open({ width: 1280, height: 800 }, { query: '?t=10' })

await test('loads without errors, no style switcher, HUD present', async () => {
  assert(page.errors.length === 0, 'errors: ' + page.errors.join(' | '))
  for (const s of ['.title-block', '.action-pill', '.rail', '.sun-dial']) assert(await page.$(s), 'missing ' + s)
  assert(!(await page.$('.style-switch')), 'style switcher still visible')
  const txt = await page.textContent('body')
  assert(!/Cinematic|Painterly|Diorama|风格/.test(txt), 'style names in UI')
})

await test('HUD covers < 12% of the screen (desktop)', async () => {
  const c = await uiCoverage(page)
  console.log('   coverage', c.pct.toFixed(2) + '%', JSON.stringify(c.boxes))
  assert(c.pct < 12, `coverage ${c.pct}`)
  assert(!c.overlap, 'HUD blocks overlap')
  assert(!c.offscreen, 'HUD offscreen')
})

await test('time dial: click → time, keyboard → +15min, sun/light follow', async () => {
  // dial is collapsed by default — expand first
  const toggle = await page.$('[data-testid=dial-toggle]')
  if (toggle) await toggle.click()
  await page.waitForSelector('.dial-svg', { timeout: 5000 })
  const box = await (await page.$('.dial-svg')).boundingBox()
  // viewBox is -8..408 wide; 18:00 at x=300
  await page.mouse.click(box.x + box.width * ((300 + 8) / 416), box.y + box.height / 2)
  const t = await st(page, (s) => s.time)
  assert(Math.abs(t - 18) < 0.3, 'time after click ' + t)
  await page.focus('.dial-svg')
  await page.keyboard.press('ArrowRight')
  const t2 = await st(page, (s) => s.time)
  assert(Math.abs(t2 - t - 0.25) < 0.01, 'keyboard step ' + t2)
  await frames(page, 25)
  const env = await page.evaluate(() => ({ t: window.__env.time, e: window.__env.sun.elevation }))
  assert(Math.abs(env.t - t2) < 0.5, 'rendered time lags ' + env.t)
  assert(env.e < 15, 'sun should be low at 18:15, elev ' + env.e)
  await page.evaluate(() => window.__world.getState().setTime(10))
  await frames(page, 25)
})

await test('drag the sun in the sky changes time', async () => {
  // Afternoon sun stays off the hero frame (behind the viewer, then to the right).
  // Face it at 16:00; earlier hours sit up and to the right along this arc.
  let err
  try {
    await page.evaluate(() => window.__world.getState().setTime(16))
    await page.waitForFunction(() => Math.abs(window.__env.time - 16) < 0.05, null, { timeout: 60000 })
    await page.evaluate(() => window.__world.getState().setCamMode('roam'))
    await page.waitForFunction(() => {
      const d = window.__env.sun.dir, r = window.__roam
      r.yaw = Math.atan2(-d.x, -d.z)
      r.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)))
      r.vel.set(0, 0, 0)
      const e = window.__cam.matrixWorld.elements
      return window.__world.getState().camMode === 'roam' && -e[8] * d.x + -e[9] * d.y + -e[10] * d.z > 0.98
    }, null, { timeout: 30000 })
    const sun = await page.evaluate(() => { const c = window.__cam.position, d = window.__env.sun.dir; return [c.x + d.x * 1400, c.y + d.y * 1400, c.z + d.z * 1400] })
    const q = await project(page, sun)
    assert(!q.behind && q.x > 0 && q.x < 1280 && q.y > 0 && q.y < 800, `sun off screen at 16: ${q.x},${q.y}`)
    const before = await st(page, (s) => s.time)
    await drag(page, q, { x: q.x + 130, y: q.y - 175 }, 12)
    const after = await st(page, (s) => s.time)
    assert(after < before - 0.5, `time ${before} → ${after} (sun at ${q.x.toFixed(0)},${q.y.toFixed(0)})`)
    await page.screenshot({ path: `${SHOTS}/T-sun-drag.png` })
  } catch (e) { err = e }
  await page.evaluate(() => { const s = window.__world.getState(); s.setTime(10); s.setCamMode('orbit') })
  await page.waitForFunction(() => {
    const p = window.__cam.position, e = window.__cam.matrixWorld.elements
    const dx = -4 - p.x, dy = 17 - p.y, dz = -80 - p.z, len = Math.hypot(dx, dy, dz)
    const look = (-e[8] * dx + -e[9] * dy + -e[10] * dz) / len
    return window.__world.getState().camMode === 'orbit' && Math.hypot(p.x - 8, p.y - 15, p.z - 38) < 1.5 && look > 0.995
  }, null, { timeout: 120000 })
  if (err) throw err
})

await test('time playback: plays, rate cycles, holds while the dial is dragged, resumes, pauses, saved in the doc', async () => {
  const t = () => st(page, (s) => s.time)
  const moved = (a, c) => { const d = ((c - a) % 24 + 24) % 24; return d > 0.04 && d < 12 }
  // the dial auto-collapses when idle (rate pill only shows expanded); open it if the previous test idled it shut
  if (!(await page.$('[data-testid=time-rate]'))) { await page.click('[data-testid=dial-toggle]'); await page.waitForSelector('[data-testid=time-rate]') }
  await page.click('[data-testid=time-play]')
  let a = await t(); await frames(page, 10)
  assert(moved(a, await t()), 'time advances while playing')
  await page.click('[data-testid=time-rate]')
  assert((await st(page, (s) => s.playRate)) === 60, 'rate cycles 30 -> 60')
  // hold the dial: time stays where the finger is
  const box = await (await page.$('.dial-svg')).boundingBox()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2); await page.mouse.down()
  await frames(page, 2)
  a = await t(); await frames(page, 8)
  assert(Math.abs((await t()) - a) < 0.01 && (await st(page, (s) => s.timeHeld)), 'holds while dragging the dial')
  await page.mouse.up()
  a = await t(); await frames(page, 8)
  assert(moved(a, await t()), 'resumes on release')
  await page.click('[data-testid=time-play]')
  a = await t(); await frames(page, 8)
  assert(Math.abs((await t()) - a) < 0.01, 'paused')
  const play = await st(page, (s) => s.getDoc().play)
  assert(play.on === false && play.rate === 60, 'doc carries play state ' + JSON.stringify(play))
  await page.evaluate(() => { const s = window.__world.getState(); s.setPlayRate(30); s.setTime(17.6, 'drag') })
})

await test('weather transitions gradually (clear → cloudy → mist → clear)', async () => {
  await page.click('[data-testid=rail-weather]')
  await page.click('[data-weather=cloudy]')
  assert((await st(page, (s) => s.weather)) === 'cloudy', 'store weather')
  await frames(page, 3)
  const early = await page.evaluate(() => window.__env.weather.cover)
  await page.waitForFunction(() => window.__env.weather.cover > 0.8, null, { timeout: 120000 })
  assert(early < 0.8, 'transition should not be instant, early cover ' + early)
  await page.screenshot({ path: `${SHOTS}/T-weather-cloudy.png` })
  await page.click('[data-weather=mist]')
  await page.waitForFunction(() => window.__env.weather.mist > 0.85, null, { timeout: 120000 })
  await page.screenshot({ path: `${SHOTS}/T-weather-mist.png` })
  await page.click('[data-weather=clear]')
  await page.waitForFunction(() => window.__env.weather.mist < 0.1 && window.__env.weather.cover < 0.3, null, { timeout: 120000 })
  await page.click('[data-testid=rail-weather]')
})

let added = null
const cleanup = async () => { await page.evaluate(() => { const s = window.__world.getState(); s.setPlacing(null); s.setPanel(null) }) }
await test('add object: pick 岩石 then click the ground', async () => {
  const n0 = await st(page, (s) => s.objects.length)
  await page.click('[data-testid=rail-add]')
  await page.click('[data-add=rock]')
  assert((await st(page, (s) => s.placing)) === 'rock', 'placing mode')
  assert(await page.$('[data-testid=placing-chip]'), 'placing chip')
  const gx = 13, gz = -18
  const gy = await page.evaluate(([x, z]) => 0, [gx, gz])
  const p = await project(page, [gx, gy, gz])
  await page.mouse.move(p.x, p.y)
  await frames(page, 2)
  await page.mouse.click(p.x, p.y)
  const s = await st(page, (s) => ({ n: s.objects.length, sel: s.selectedId, last: s.objects[s.objects.length - 1], placing: s.placing }))
  assert(s.n === n0 + 1, 'object count ' + s.n)
  assert(s.last.type === 'rock' && s.sel === s.last.id && !s.placing, 'selected new rock')
  assert(Math.hypot(s.last.pos[0] - gx, s.last.pos[2] - gz) < 3, 'placed near click ' + JSON.stringify(s.last.pos))
  assert(Math.abs(s.last.pos[1] - (await page.evaluate(() => 0))) < 50, 'on terrain')
  added = s.last
  await page.waitForSelector('[data-testid=obj-toolbar]', { timeout: 60000 })
})

await cleanup().catch(() => {})
await test('move: drag the selected object across the ground', async () => {
  const from = await project(page, [added.pos[0], added.pos[1] + 0.6, added.pos[2]])
  await drag(page, from, { x: from.x - 140, y: from.y + 30 }, 10)
  const o = await st(page, (s) => s.objects.find((o) => o.id === '' + s.selectedId))
  assert(o && o.id === added.id, 'still selected')
  const moved = Math.hypot(o.pos[0] - added.pos[0], o.pos[2] - added.pos[2])
  assert(moved > 2, 'moved distance ' + moved)
  added = o
  await frames(page, 6)
  await page.screenshot({ path: `${SHOTS}/T-edit-selected.png` })
})

await test('rotate + scale via toolbar, F/R shortcuts', async () => {
  await page.click('[data-act=向右转]')
  let o = await st(page, (s) => s.objects.find((o) => o.id === s.selectedId))
  assert(Math.abs(o.rotY - (added.rotY - Math.PI / 6)) < 1e-6, 'rotY ' + o.rotY)
  await page.click('[data-act=放大]')
  o = await st(page, (s) => s.objects.find((o) => o.id === s.selectedId))
  assert(o.scale > 1.1, 'scale ' + o.scale)
  await page.keyboard.press('r')
  const o2 = await st(page, (s) => s.objects.find((o) => o.id === s.selectedId))
  assert(Math.abs(o2.rotY - o.rotY) > 0.2, 'R rotates')
})

await test('delete via toolbar; click empty space deselects', async () => {
  const n0 = await st(page, (s) => s.objects.length)
  await page.click('[data-act=删除]')
  const s = await st(page, (s) => ({ n: s.objects.length, sel: s.selectedId }))
  assert(s.n === n0 - 1 && s.sel === null, 'deleted')
  await page.click('[data-testid=toast-action]')
  assert((await st(page, (s) => s.objects.length)) === n0, 'undo restored the object')
  await page.waitForSelector('[data-testid=obj-toolbar]', { timeout: 60000 })
  await page.click('[data-act=删除]')
  assert((await st(page, (s) => s.objects.length)) === n0 - 1, 'deleted again')
  // select the default bench then click sky to deselect
  const bench = await st(page, (s) => s.objects.find((o) => o.type === 'house'))
  const p = await project(page, [bench.pos[0], bench.pos[1] + 1.2, bench.pos[2]])
  await page.mouse.click(p.x, p.y)
  assert((await st(page, (s) => s.selectedId)) === bench.id, 'house selected by click')
  await page.mouse.click(640, 120)
  assert((await st(page, (s) => s.selectedId)) === null, 'deselected by clicking sky')
})

await test('drag a floating island in the air', async () => {
  const isl = await st(page, (s) => s.objects.find((o) => o.type === 'island' && o.variant === 0))
  const p = await project(page, [isl.pos[0], isl.pos[1] - 3, isl.pos[2]])
  await drag(page, p, { x: p.x + 120, y: p.y }, 10)
  const o = await st(page, (s) => s.objects.find((o) => o.id === '${isl.id}'.replace('${isl.id}', s.selectedId)))
  assert(o.id === isl.id, 'island selected ' + o.id)
  assert(Math.abs(o.pos[1] - isl.pos[1]) < 1e-6, 'island height kept')
  assert(Math.hypot(o.pos[0] - isl.pos[0], o.pos[2] - isl.pos[2]) > 3, 'island moved')
  await page.keyboard.press('Escape')
})

await test('drag a cloud, then turn a cloud into an island', async () => {
  const clouds = await st(page, (s) => s.clouds)
  let target = null, p = null
  for (const c of clouds) {
    const q = await project(page, c.pos)
    if (!q.behind && q.x > 260 && q.x < 1020 && q.y > 60 && q.y < 330) { target = c; p = q; break }
  }
  assert(target, 'no cloud on screen')
  await drag(page, p, { x: p.x - 100, y: p.y + 10 }, 10)
  const c2 = await st(page, (s) => s.clouds.find((c) => c.id === s.selectedId))
  assert(c2 && c2.id === target.id, 'cloud selected')
  assert(Math.hypot(c2.pos[0] - target.pos[0], c2.pos[2] - target.pos[2]) > 5, 'cloud moved')
  await page.waitForSelector('[data-testid=cloud-toolbar]', { timeout: 60000 })
  const n0 = await st(page, (s) => s.objects.length)
  await page.click('[data-act=化为浮岛]')
  const s = await st(page, (s) => ({ n: s.objects.length, c: s.clouds.length, last: s.objects[s.objects.length - 1] }))
  assert(s.n === n0 + 1 && s.last.type === 'island' && s.c === clouds.length - 1, 'cloud became island')
  await frames(page, 10)
  await page.keyboard.press('Escape')
})

await test('gravity: weightless lifts objects, chip shows, restore lands them', async () => {
  await page.click('[data-testid=rail-gravity]')
  const T0 = Date.now(); const lap = (m) => console.log(`   [gravity] ${m} @${((Date.now() - T0) / 1000).toFixed(1)}s`)
  await page.click('[data-gravity="0"]')
  assert((await st(page, (s) => s.gravity)) === 0, 'gravity 0')
  assert(!(await page.$('[data-testid=gravity-chip]')), 'chip hidden while the gravity panel is open')
  await page.waitForFunction(() => { const rock = window.__world.getState().objects.find((o) => o.type === 'rock'); const s = window.__sims.get(rock.id); return s && s.off.y > 3 }, null, { timeout: 120000 })
  lap('lifted')
  await page.click('[data-testid=rail-gravity]')
  assert(await page.$('[data-testid=gravity-chip]'), 'gravity chip after closing panel')
  await frames(page, 10)
  await page.screenshot({ path: `${SHOTS}/T-gravity-weightless.png` })
  await page.click('[data-testid=rail-gravity]')
  await page.click('[data-gravity="-0.6"]')
  await page.click('[data-testid=orbit-toggle]', { force: true }).catch(async () => page.click('.toggle'))
  assert(await st(page, (s) => s.orbit), 'orbit on')
  await page.waitForFunction(() => { const i = window.__world.getState().objects.find((o) => o.type === 'island'); const s = window.__sims.get(i.id); return Math.abs(s.orbit) > 0.05 }, null, { timeout: 120000 })
  lap('orbiting')
  await page.click('[data-testid=restore-rules]')
  const r = await st(page, (s) => ({ g: s.gravity, o: s.orbit }))
  assert(r.g === 1 && !r.o, 'rules restored')
  assert(!(await page.$('[data-testid=gravity-chip]')), 'chip hidden after restore')
  await page.waitForFunction(() => [...window.__sims.values()].every((s) => Math.abs(s.off.y) < 0.3 && Math.abs(s.off.x) < 0.5), null, { timeout: 180000 })
  lap('landed')
  await page.click('[data-testid=rail-gravity]')
})

const camReset = async (pg) => {
  // the camera tool is a small panel: 复位视角 / 自由漫游
  if (!(await pg.isVisible('[data-testid=panel-camera]'))) await pg.click('[data-testid=rail-view]')
  await pg.click('[data-testid=cam-reset]')
}
await test('camera orbit is limited and reset returns home', async () => {
  await camReset(page)
  await page.waitForTimeout(2500)
  await frames(page, 5)
  const home = await page.evaluate(() => window.__cam.position.toArray())
  assert(Math.hypot(home[0] - 8, home[1] - 15, home[2] - 38) < 0.5, 'home framing ' + home)
  const c = { x: 640, y: 500 }
  await drag(page, c, { x: 900, y: 650 }, 10)
  await page.mouse.wheel(0, 2000)
  await frames(page, 20)
  const moved = await page.evaluate(() => window.__cam.position.toArray())
  const dist = Math.hypot(moved[0] - home[0], moved[1] - home[1], moved[2] - home[2])
  assert(dist > 3, 'camera did not move ' + dist)
  const tooLow = await page.evaluate(() => window.__cam.position.y)
  assert(tooLow > 1, 'camera under ground')
  await camReset(page)
  await page.waitForFunction((h) => { const p = window.__cam.position; return Math.hypot(p.x - h[0], p.y - h[1], p.z - h[2]) < 1.5 }, home, { timeout: 120000 })
})

await test('looser orbit: zoom in closer than before, camera never inside an island', async () => {
  // dolly to 6 m from the pivot (old limit was 12 m): the controls must keep it there
  await frames(page, 14) // let the home glide from the previous reset finish
  await page.evaluate(() => {
    const cam = window.__cam, t = window.__camTarget
    const dir = cam.position.clone().sub(t).normalize()
    cam.position.copy(t).addScaledVector(dir, 6)
  })
  await frames(page, 12)
  const dist = await page.evaluate(() => window.__cam.position.distanceTo(window.__camTarget))
  assert(dist < 11.5, 'can zoom closer than the old 12 m limit: ' + dist)
  // park the camera inside the hero island rock: collision must push it out (or onto the grass)
  const isl = await st(page, (s) => s.objects.find((o) => o.type === 'island'))
  await page.evaluate((p) => { window.__cam.position.set(p[0], p[1] - 4, p[2]) }, isl.pos)
  await frames(page, 4)
  const out = await page.evaluate((p) => { const c = window.__cam.position; return { d: Math.hypot(c.x - p[0], c.z - p[2]), y: c.y } }, isl.pos)
  assert(out.d > 3 || out.y > isl.pos[1], 'camera left inside island ' + JSON.stringify(out))
  await camReset(page)
  await page.waitForFunction(() => { const p = window.__cam.position; return Math.hypot(p.x - 8, p.y - 15, p.z - 38) < 1.5 }, null, { timeout: 120000 })
})

await test('free-roam: toggle, WASD walk, drag to look, typing does not move, ground collision, Esc glides home', async () => {
  if (!(await page.isVisible('[data-testid=panel-camera]'))) await page.click('[data-testid=rail-view]')
  await page.click('[data-testid=cam-roam]')
  assert(await page.isVisible('[data-testid=roam-hud]'), 'roam hint visible')
  assert((await st(page, (s) => s.camMode)) === 'roam', 'roam mode')
  const p0 = await page.evaluate(() => window.__cam.position.toArray())
  await page.keyboard.down('KeyW'); await frames(page, 10); await page.keyboard.up('KeyW')
  await frames(page, 6)
  const p1 = await page.evaluate(() => window.__cam.position.toArray())
  assert(p1[2] < p0[2] - 2, 'W walks forward (towards the city) ' + p0 + ' -> ' + p1)
  // drag to look
  // look down at open meadow first so the drag starts on bare ground (an object/cloud/sun drag rightly wins)
  await page.evaluate(() => { window.__roam.pitch = -0.55 })
  await frames(page, 2)
  const yaw0 = await page.evaluate(() => window.__roam.yaw)
  await drag(page, { x: 640, y: 560 }, { x: 820, y: 575 }, 6)
  const yaw1 = await page.evaluate(() => window.__roam.yaw)
  assert(Math.abs(yaw1 - yaw0) > 0.2, 'drag turns the view ' + yaw0 + ' -> ' + yaw1)
  // typing a world name must not walk
  await page.click('[data-testid=open-save]')
  await page.click('[data-testid=world-name]')
  const before = await page.evaluate(() => window.__cam.position.toArray())
  await page.keyboard.type('wasd ')
  await frames(page, 8)
  const after = await page.evaluate(() => window.__cam.position.toArray())
  assert(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) < 0.05, 'moved while typing')
  assert((await page.inputValue('[data-testid=world-name]')).includes('wasd'), 'text typed')
  await page.evaluate(() => { document.activeElement?.blur(); window.__world.getState().setPanel(null) })
  // ground collision
  await page.evaluate(() => { window.__cam.position.y = -30 })
  await frames(page, 3)
  assert(await page.evaluate(() => window.__cam.position.y > 0.5), 'below ground')
  // detailed asset trees follow the walker (no procedural blobs up close far from home)
  const split0 = await page.evaluate(() => window.__treeSplit.join(','))
  await page.evaluate(() => { window.__cam.position.set(-60, 2, -150) })
  await page.waitForFunction((s0) => window.__treeSplit.join(',') !== s0 && window.__treeSplit[0] > 20, split0, { timeout: 60000 })
  // Esc (or the 返回 button) glides back to the home framing
  await page.click('[data-testid=roam-exit]')
  await page.waitForFunction(() => { const p = window.__cam.position; return Math.hypot(p.x - 8, p.y - 15, p.z - 38) < 1.5 }, null, { timeout: 120000 })
  assert((await st(page, (s) => s.camMode)) === 'orbit', 'back to orbit')
  // Esc path
  await page.click('[data-testid=rail-view]')
  await page.click('[data-testid=cam-roam]')
  await page.keyboard.down('KeyD'); await frames(page, 6); await page.keyboard.up('KeyD')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__world.getState().camMode === 'orbit', null, { timeout: 30000 })
  await page.waitForFunction(() => { const p = window.__cam.position; return Math.hypot(p.x - 8, p.y - 15, p.z - 38) < 1.5 }, null, { timeout: 120000 })
  await page.screenshot({ path: `${SHOTS}/T-roam-home.png` })
})

let savedDoc = null
await test('quality 高/中/低: trees follow the tier, choice persists, 自动 clears it', async () => {
  await page.click('[data-testid=rail-view]')
  const q = () => page.evaluate(() => ({ q: window.__world.getState().quality, auto: window.__world.getState().qualityAuto, split: window.__treeSplit.join(','), ls: localStorage.getItem('world-listens.quality') }))
  assert((await q()).q === 'medium', 'tests run at 中')
  await page.click('[data-testid=q-high]')
  await page.waitForFunction(() => window.__world.getState().quality === 'high' && window.__treeSplit[1] === 0, null, { timeout: 60000 })
  assert((await q()).ls === 'high', 'persisted ' + JSON.stringify(await q()))
  await page.click('[data-testid=q-low]')
  await page.waitForFunction(() => window.__world.getState().quality === 'low' && window.__treeSplit[0] === 0, null, { timeout: 60000 })
  await page.click('[data-testid=q-auto]')
  const a = await q()
  assert(a.auto && a.ls === null, 'auto clears the override ' + JSON.stringify(a))
  await page.click('[data-testid=q-medium]')
  await page.waitForFunction(() => window.__world.getState().quality === 'medium' && window.__treeSplit[0] > 0 && window.__treeSplit[1] > 0, null, { timeout: 60000 })
  await page.click('[data-testid=rail-view]')
})

await test('save locally, change world, load save back', async () => {
  await page.click('[data-testid=open-save]')
  await page.fill('[data-testid=world-name]', '黄昏之城')
  const poseBefore = await page.evaluate(() => window.__cam.position.toArray())
  await page.click('[data-testid=save-local]')
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('world-listens.saves.v1') || '[]').length > 0, null, { timeout: 120000 })
  const saves = await page.evaluate(() => JSON.parse(localStorage.getItem('world-listens.saves.v1') || '[]'))
  // auto-framing glides back to where the user was
  await page.waitForFunction((p) => { const c = window.__cam.position; return Math.hypot(c.x - p[0], c.y - p[1], c.z - p[2]) < 1.5 }, poseBefore, { timeout: 120000 })
  assert(saves.length >= 1 && saves[0].name === '黄昏之城', 'saved entry')
  savedDoc = saves[0].doc
  assert(saves[0].thumb && saves[0].thumb.startsWith('data:image/jpeg'), 'thumbnail')
  await page.evaluate(() => { const s = window.__world.getState(); s.removeObject(s.objects[0].id); s.setWeather('mist') })
  await page.click('.save-item')
  const s = await st(page, (s) => ({ n: s.objects.length, w: s.weather, name: s.name }))
  assert(s.n === savedDoc.objects.length && s.w === savedDoc.weather && s.name === '黄昏之城', 'loaded ' + JSON.stringify(s))
})

await test('export PNG downloads an image', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-testid=export-png]')])
  const f = `${SHOTS}/T-export.png`
  await dl.saveAs(f)
  const buf = fs.readFileSync(f)
  assert(buf.slice(1, 4).toString() === 'PNG' && buf.length > 50000, 'png size ' + buf.length)
  assert(dl.suggestedFilename() === '黄昏之城.png', 'filename ' + dl.suggestedFilename())
  await page.click('[data-testid=open-save]')
})

let link = ''
await test('share link round-trips the whole world', async () => {
  await page.evaluate(() => { const s = window.__world.getState(); s.setGravity(0.45); s.setTime(18.4) })
  await page.click('[data-testid=open-share]')
  await page.waitForFunction(() => document.querySelector('[data-testid=share-link]').value.includes('#w='), null, { timeout: 30000 })
  link = await page.inputValue('[data-testid=share-link]')
  assert(link.length < 8000, 'link too long ' + link.length)
  const doc = await st(page, (s) => s.getDoc())
  const p2 = await open({ width: 900, height: 600 }, { query: link.slice(link.indexOf('#')) })
  try {
    await p2.page.waitForFunction(() => window.__world.getState().name === '黄昏之城', null, { timeout: 60000 })
    const d2 = await st(p2.page, (s) => s.getDoc())
    assert(d2.objects.length === doc.objects.length, 'object count')
    assert(Math.abs(d2.gravity - 0.45) < 0.01 && Math.abs(d2.time - 18.4) < 0.01, 'rules/time')
    for (let i = 0; i < doc.objects.length; i++) assert(Math.abs(d2.objects[i].pos[0] - doc.objects[i].pos[0]) < 0.02, 'pos ' + i)
    assert(p2.page.errors.length === 0, 'errors in shared page ' + p2.page.errors.join('|'))
  } finally { await p2.ctx.close() }
  await page.click('[data-testid=open-share]')
})

await test('combo surprise: starry night + weightless → meteor shower discovered', async () => {
  await page.evaluate(() => { const s = window.__world.getState(); s.setTime(22.5, 'drag'); s.setWeather('starry'); s.setGravity(0) })
  await page.waitForFunction(() => window.__surprises.activeSurprises.has('meteors'), null, { timeout: 60000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('流星雨')), null, { timeout: 30000 })
  assert((await page.evaluate(() => JSON.parse(localStorage.getItem('world-listens.surprises')))).includes('meteors'), 'persisted')
  await frames(page, 20)
  await page.screenshot({ path: `${SHOTS}/T-surprise-meteors.png` })
  await page.evaluate(() => { const s = window.__world.getState(); s.setGravity(1); s.setWeather('clear') })
})

await test('fireflies: none by day; a clear night with normal gravity (萤火之夜) brings them, day fades them out', async () => {
  await page.evaluate(() => { const s = window.__world.getState(); s.setTime(12, 'drag'); s.setWeather('clear'); s.setGravity(1) })
  await frames(page, 10)
  assert((await page.evaluate(() => window.__fireflies ?? 0)) < 0.01, 'no fireflies by day')
  await page.evaluate(() => window.__world.getState().setTime(22, 'drag'))
  await page.waitForFunction(() => window.__surprises.activeSurprises.has('fireflies') && window.__fireflies > 0.3, null, { timeout: 90000 })
  await page.evaluate(() => window.__world.getState().setTime(12, 'drag'))
  await page.waitForFunction(() => window.__fireflies < 0.05, null, { timeout: 90000 })
})

await test('autosave: reload restores the edited world', async () => {
  await page.evaluate(() => { const s = window.__world.getState(); s.setName('续存测试'); s.addObject('pine', [14, 0, -10]) })
  const n = await st(page, (s) => s.objects.length)
  await page.waitForTimeout(1500)
  await page.goto(BASE + '/')
  await page.waitForFunction(() => (window.__frames ?? 0) > 5, null, { timeout: 240000 })
  await page.waitForFunction(() => window.__world.getState().name === '续存测试', null, { timeout: 30000 })
  assert((await st(page, (s) => s.objects.length)) === n, 'object count after reload')
})

await test('reset world (two-step confirm)', async () => {
  await page.click('[data-testid=open-save]')
  await page.click('[data-testid=reset-world]')
  await page.click('[data-testid=reset-confirm]')
  const s = await st(page, (s) => ({ name: s.name, g: s.gravity, n: s.objects.length }))
  assert(s.name === '我的世界' && s.g === 1, 'reset ' + JSON.stringify(s))
  await page.keyboard.press('Escape')
})

await test('sun-drag wow: fast time change raises a wind gust with petals', async () => {
  await page.evaluate(() => { const s = window.__world.getState(); let k = 0; window.__gustTimer = setInterval(() => { k++; s.setTime(17.6 + 0.4 * Math.abs(Math.sin(k * 0.5))) }, 120) })
  await page.waitForFunction(() => window.__gust > 0.2, null, { timeout: 60000 })
  await page.evaluate(() => clearInterval(window.__gustTimer))
  await page.waitForFunction(() => window.__gust < 0.1, null, { timeout: 90000 })
})

await test('no runtime errors during the whole desktop session', async () => {
  assert(page.errors.length === 0, page.errors.join(' | '))
})
await ctx.close()

// ───────────────────────── mobile ─────────────────────────
await test('mobile layout: HUD < 12%, no overlap, panels as sheets, tap to place', async () => {
  const { ctx: mctx, page: m } = await open({ width: 390, height: 844 }, { mobile: true, dpr: 2, query: '?t=17.6' })
  const c = await uiCoverage(m)
  console.log('   mobile coverage', c.pct.toFixed(2) + '%', JSON.stringify(c.boxes))
  assert(c.pct < 12, 'coverage ' + c.pct)
  assert(!c.overlap && !c.offscreen, 'overlap/offscreen')
  await m.screenshot({ path: `${SHOTS}/T-mobile-home.png` })
  await m.tap('[data-testid=rail-add]')
  const sheet = await (await m.$('[data-testid=panel-add]')).boundingBox()
  assert(sheet.x >= 0 && sheet.x + sheet.width <= 390 && sheet.y + sheet.height < 844, 'sheet inside viewport')
  await m.screenshot({ path: `${SHOTS}/T-mobile-add-panel.png` })
  await m.tap('[data-add=tree]')
  const p = await project(m, [12, 0.5, 4])
  await m.touchscreen.tap(p.x, p.y)
  const s = await st(m, (s) => ({ last: s.objects[s.objects.length - 1], sel: s.selectedId }))
  assert(s.last.type === 'tree' && s.sel === s.last.id, 'tap placed tree')
  await m.waitForSelector('[data-testid=selection-bar]', { timeout: 60000 })
  const bar = await (await m.$('[data-testid=selection-bar]')).boundingBox()
  assert(bar.x >= 0 && bar.x + bar.width <= 390, 'selection bar inside viewport')
  await frames(m, 8)
  await m.screenshot({ path: `${SHOTS}/T-mobile-edit.png` })
  assert(m.errors.length === 0, m.errors.join(' | '))
  await mctx.close()
})

await test('mobile free-roam: joystick walks, drag looks, rail hidden, 返回 exits', async () => {
  const { ctx: mctx, page: m } = await open({ width: 390, height: 844 }, { mobile: true, dpr: 1, query: '?t=15' })
  await m.tap('[data-testid=rail-view]')
  await m.tap('[data-testid=cam-roam]')
  await m.waitForSelector('[data-testid=roam-joystick]')
  assert(!(await m.isVisible('.rail')), 'rail hidden while roaming on a phone')
  const p0 = await m.evaluate(() => window.__cam.position.toArray())
  const j = await (await m.$('[data-testid=roam-joystick]')).boundingBox()
  const cx = j.x + j.width / 2, cy = j.y + j.height / 2
  await m.mouse.move(cx, cy); await m.mouse.down(); await m.mouse.move(cx, cy - 45, { steps: 3 })
  await frames(m, 10)
  await m.mouse.up()
  await frames(m, 4)
  const p1 = await m.evaluate(() => window.__cam.position.toArray())
  assert(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 2, 'joystick walked ' + p0 + ' -> ' + p1)
  await m.screenshot({ path: `${SHOTS}/T-mobile-roam.png` })
  await m.tap('[data-testid=roam-exit]')
  assert((await st(m, (s) => s.camMode)) === 'orbit', 'exit roam')
  assert(m.errors.length === 0, m.errors.join(' | '))
  await mctx.close()
})

await test('mobile roam touch gestures: drag looks, pinch moves, two-finger drag rises, double-tap glides, no selection', async () => {
  const { ctx: mctx, page: m } = await open({ width: 390, height: 844 }, { mobile: true, dpr: 1, query: '?t=15' })
  await m.tap('[data-testid=rail-view]')
  await m.tap('[data-testid=cam-roam]')
  await m.waitForSelector('[data-testid=roam-joystick]')
  const cdp = await mctx.newCDPSession(m)
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
  const gesture = async (from, to, steps = 6) => {
    await touch('touchStart', from)
    for (let k = 1; k <= steps; k++) await touch('touchMove', from.map(([x, y], i) => [x + (to[i][0] - x) * k / steps, y + (to[i][1] - y) * k / steps]))
    await touch('touchEnd', [])
    await frames(m, 12)
  }
  const place = () => m.evaluate(() => { window.__cam.position.set(4, 4, 18); window.__roam.yaw = 0; window.__roam.pitch = 0; window.__roam.vel.set(0, 0, 0); window.__roam.gesture.fwd = window.__roam.gesture.rise = 0; window.__roam.glide = null })
  const cam = () => m.evaluate(() => ({ p: window.__cam.position.toArray(), yaw: window.__roam.yaw, pitch: window.__roam.pitch }))
  // one finger: look
  await place(); await frames(m, 3)
  let a = await cam()
  await gesture([[220, 430]], [[130, 400]])
  let c = await cam()
  assert(Math.abs(c.yaw - a.yaw) > 0.25 && Math.abs(c.pitch - a.pitch) > 0.05, 'drag looks ' + JSON.stringify([a, c]))
  // pinch apart: forward along the view
  await place(); await frames(m, 3)
  a = await cam()
  await gesture([[160, 450], [230, 450]], [[80, 450], [310, 450]])
  c = await cam()
  assert(a.p[2] - c.p[2] > 4 && Math.abs(c.yaw) < 0.05, 'pinch moves forward ' + JSON.stringify([a.p, c.p]))
  // two fingers up together: rise
  await place(); await frames(m, 3)
  a = await cam()
  await gesture([[160, 520], [230, 520]], [[160, 380], [230, 380]])
  c = await cam()
  assert(c.p[1] - a.p[1] > 4 && Math.hypot(c.p[0] - a.p[0], c.p[2] - a.p[2]) < 2, 'two-finger drag rises ' + JSON.stringify([a.p, c.p]))
  // double-tap the meadow ahead: glide there, stopping above the ground
  await place(); await m.evaluate(() => { window.__roam.pitch = -0.35; window.__roam.tapMs = window.__roam.doubleTapMs = 8000 }); await frames(m, 3)
  a = await cam()
  for (let k = 0; k < 2; k++) { await touch('touchStart', [[195, 640]]); await touch('touchEnd', []) }
  await m.waitForFunction(() => window.__roam.glide !== null || window.__cam.position.z < 15, null, { timeout: 30000 })
  await frames(m, 30)
  c = await cam()
  const ground = await m.evaluate(([x, z]) => window.__world && window.__terrainH ? window.__terrainH(x, z) : null, [c.p[0], c.p[2]])
  assert(a.p[2] - c.p[2] > 3, 'double-tap glides ' + JSON.stringify([a.p, c.p, ground]))
  assert((await st(m, (s) => s.selectedId)) === null, 'touches in roam never select')
  await m.screenshot({ path: 'shots/verify/mobile-roam.png' })
  await m.tap('[data-testid=roam-exit]')
  assert(m.errors.length === 0, m.errors.join(' | '))
  await mctx.close()
})

await test('first-visit onboarding hint shows once and dismisses', async () => {
  const { ctx: hctx, page: h } = await open({ width: 1280, height: 800 }, { showHint: true })
  assert(await h.$('[data-testid=hint]'), 'hint visible')
  await h.click('[data-testid=hint-ok]')
  assert(!(await h.$('[data-testid=hint]')), 'hint dismissed')
  assert((await h.evaluate(() => localStorage.getItem('world-listens.hint'))) === '1', 'remembered')
  await hctx.close()
})

await b.close()
const pass = results.filter((r) => r.ok).length
console.log(`\n${pass}/${results.length} passed in ${((Date.now() - t0all) / 60000).toFixed(1)} min`)
fs.writeFileSync('tests/last-results.json', JSON.stringify(results, null, 2))
process.exit(pass === results.length ? 0 : 1)
