// Targeted probes for state, input, and resource bugs.
// Run: BASE=http://127.0.0.1:4174 node qa-tests/browser-probe.mjs
// Asserts the corrected behaviour. Failures name the bug.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4174'
const results = []
const openCtx = new Set()
const assert = (c, m) => { if (!c) throw new Error(m) }
async function test(name, fn) {
  const t0 = Date.now()
  try { await fn(); results.push({ name, ok: true, s: (Date.now() - t0) / 1000 }); console.log('✔', name, `${((Date.now() - t0) / 1000).toFixed(1)}s`) }
  catch (e) { results.push({ name, ok: false, err: String(e.message || e).slice(0, 400) }); console.log('✘', name, '—', e.message) }
  finally {
    for (const c of openCtx) { await c.close().catch(() => {}); openCtx.delete(c) }
  }
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

async function boot(opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: opts.dpr ?? 1,
    isMobile: !!opts.mobile,
    hasTouch: !!opts.mobile,
  })
  if (opts.init) await ctx.addInitScript(opts.init)
  if (!opts.keepHint) await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.errors = errors
  openCtx.add(ctx)
  const q = opts.query ?? '?fresh'
  await page.goto(BASE + '/' + q, { waitUntil: 'domcontentloaded' })
  if (!opts.allowCrash) {
    await page.waitForFunction(() => window.__world, null, { timeout: 30000 })
  } else {
    await page.waitForTimeout(800)
  }
  return { ctx, page }
}
const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
  const f0 = window.__frames ?? 0
  const chk = () => ((window.__frames ?? 0) >= f0 + n ? res(window.__frames) : requestAnimationFrame(chk))
  chk()
}), n)

await test('corrupted surprises JSON (object, old shape) does not white-screen', async () => {
  const { ctx, page } = await boot({
    allowCrash: true,
    init: () => localStorage.setItem('world-listens.surprises', '{}'),
    query: '?fresh',
  })
  const crashed = page.errors.some((e) => /not iterable|pageerror|Unexpected/i.test(e) || e.includes('is not iterable'))
  const alive = await page.evaluate(() => !!window.__world).catch(() => false)
  assert(!page.errors.some((e) => /not iterable/.test(e)), 'pageerror: ' + page.errors.join(' | '))
  assert(alive, 'store never mounted; errors: ' + page.errors.join(' | '))
  assert(!crashed, page.errors.join(' | '))
  await ctx.close()
})

await test('blocked localStorage.getItem does not crash startup; hint can still be dismissed', async () => {
  const { ctx, page } = await boot({
    allowCrash: true,
    keepHint: true,
    init: () => {
      const g = Storage.prototype.getItem
      const s = Storage.prototype.setItem
      Storage.prototype.getItem = function (k) {
        if (String(k).startsWith('world-listens')) throw new DOMException('blocked', 'SecurityError')
        return g.call(this, k)
      }
      Storage.prototype.setItem = function (k, v) {
        if (String(k).startsWith('world-listens')) throw new DOMException('quota', 'QuotaExceededError')
        return s.call(this, k, v)
      }
    },
    query: '?fresh',
  })
  const alive = await page.evaluate(() => !!window.__world).catch(() => false)
  assert(alive, 'startup crashed: ' + page.errors.join(' | '))
  const hint = await page.$('[data-testid=hint-ok]')
  assert(hint, 'hint missing (storage read should fall open, not hide the app)')
  await hint.click()
  await page.waitForTimeout(100)
  const still = await page.$('[data-testid=hint]')
  assert(!still, 'hint stayed because setItem threw')
  assert(!page.errors.some((e) => /QuotaExceeded|SecurityError|blocked/.test(e)), 'uncaught: ' + page.errors.join(' | '))
  await ctx.close()
})

await test('undo after reset does not duplicate ids; plain undo still restores', async () => {
  const { ctx, page } = await boot({ query: '?fresh' })
  const r = await page.evaluate(() => {
    const s = window.__world.getState()
    const before = s.objects.filter((o) => o.id === 'bench-0').length
    s.deleteWithUndo('bench-0')
    const mid = window.__world.getState().objects.some((o) => o.id === 'bench-0')
    const action = window.__world.getState().toasts.at(-1)?.action?.run
    action()
    const restored = window.__world.getState().objects.filter((o) => o.id === 'bench-0').length
    window.__world.getState().deleteWithUndo('bench-0')
    const action2 = window.__world.getState().toasts.at(-1)?.action?.run
    window.__world.getState().resetWorld()
    if (action2) action2()
    const after = window.__world.getState().objects.filter((o) => o.id === 'bench-0').length
    const ids = window.__world.getState().objects.map((o) => o.id)
    return { before, mid, restored, after, unique: new Set(ids).size === ids.length, n: ids.length }
  })
  assert(r.before === 1 && r.mid === false, 'delete did not remove bench ' + JSON.stringify(r))
  assert(r.restored === 1, 'undo did not restore bench ' + JSON.stringify(r))
  assert(r.after === 1 && r.unique, 'undo-after-reset duplicated ids ' + JSON.stringify(r))
  await ctx.close()
})

await test('re-clicking the active weather does not move the clock; switching still does', async () => {
  const { ctx, page } = await boot({ query: '?fresh&t=10' })
  const r = await page.evaluate(() => {
    const api = window.__world.getState()
    api.setTime(22, 'drag')
    api.setWeather('clear') // already clear, clock is 22:00
    const stayed = window.__world.getState().time
    api.setWeather('starry')
    const night = window.__world.getState().time
    api.setWeather('clear')
    const morning = window.__world.getState().time
    api.setTime(19.4, 'drag')
    api.setWeather('sunset')
    const dusk = window.__world.getState().time
    api.setTime(19.9, 'drag')
    api.setWeather('sunset') // already sunset; user had nudged the dial
    const nudged = window.__world.getState().time
    return { stayed, night, morning, dusk, nudged }
  })
  assert(Math.abs(r.stayed - 22) < 0.01, 're-click clear jumped the clock to ' + r.stayed)
  assert(r.night > 20, 'starry did not stay at night ' + r.night)
  assert(Math.abs(r.morning - 9) < 0.01, 'clear-from-starry should go to morning, got ' + r.morning)
  assert(Math.abs(r.dusk - 18.6) < 0.01, 'sunset preset ' + r.dusk)
  assert(Math.abs(r.nudged - 19.9) < 0.01, 're-click sunset reset the dial to ' + r.nudged)
  await ctx.close()
})

await test('autosave flushes on pagehide (reset is not lost if the tab closes immediately)', async () => {
  const { ctx, page } = await boot({ query: '?fresh' })
  await page.waitForTimeout(50)
  const r = await page.evaluate(() => {
    localStorage.removeItem('world-listens.autosave.v1')
    window.__world.getState().setName('flush-check')
    window.__world.getState().resetWorld()
    window.dispatchEvent(new Event('pagehide'))
    const raw = localStorage.getItem('world-listens.autosave.v1')
    return { raw: raw && raw.slice(0, 180), has: !!raw && raw.includes('我的世界') && !raw.includes('flush-check') }
  })
  assert(r.has, 'pagehide did not flush the reset world: ' + r.raw)
  await ctx.close()
})

await test('share link tracks edits made while the panel is open', async () => {
  const { ctx, page } = await boot({ query: '?fresh&t=10' })
  await page.click('[data-testid=open-share]')
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid=share-link]')
    return el && el.value.includes('#w=')
  }, null, { timeout: 10000 })
  const a = await page.locator('[data-testid=share-link]').inputValue()
  await page.evaluate(() => window.__world.getState().setTime(4.25, 'drag'))
  await page.waitForFunction((prev) => {
    const el = document.querySelector('[data-testid=share-link]')
    return el && el.value.includes('#w=') && el.value !== prev
  }, a, { timeout: 4000 }).catch(() => {})
  const b = await page.locator('[data-testid=share-link]').inputValue()
  assert(a !== b, 'link unchanged after setTime(4.25)')
  const code = new URL(b).hash.slice(3) // #w=
  // hash is #w=CODE
  const decoded = await page.evaluate(async (href) => {
    const h = new URL(href).hash
    const m = h.match(/[#&]w=([^&]+)/)
    const mod = await import('/src/state/serialize.ts')
    return mod.decodeShare(m[1])
  }, b).catch(async () => {
    // production bundle does not expose the module URL; decode via the live store after navigation is heavier.
    return null
  })
  if (decoded) assert(Math.abs(decoded.time - 4.25) < 0.02, 'decoded time ' + decoded.time)
  else assert(b.includes('#w=') && a !== b, 'link did not refresh')
  void code
  await ctx.close()
})

await test('?t= outside 0–24 wraps; label matches the hour', async () => {
  const { ctx, page } = await boot({ allowCrash: true, query: '?t=30' })
  await page.waitForFunction(() => window.__world, null, { timeout: 20000 })
  const r = await page.evaluate(() => ({
    time: window.__world.getState().time,
    label: document.querySelector('[data-testid=dial-time]')?.textContent,
  }))
  assert(Math.abs(r.time - 6) < 1e-6, 't=30 stored as ' + r.time)
  assert(r.label === '06:00', 'label ' + r.label)
  await ctx.close()
})

await test('autosave with a null entry and time:30 still restores the good objects', async () => {
  const { ctx, page } = await boot({
    query: '',
    init: () => {
      localStorage.setItem('world-listens.autosave.v1', JSON.stringify({
        v: 1, name: '残卷', time: 30, weather: 'clear', gravity: 1, orbit: false,
        objects: [{ id: 'tree-keep', type: 'tree', pos: [3, 1, -4], rotY: 0, scale: 1, variant: 0 }, null],
        clouds: [{ id: 'cloud-keep', pos: [10, 80, -220], scale: 1, seed: 2 }, null],
      }))
    },
  })
  const r = await page.evaluate(() => {
    const s = window.__world.getState()
    return { name: s.name, time: s.time, ids: s.objects.map((o) => o.id), clouds: s.clouds.map((c) => c.id), errors: [] }
  })
  assert(r.name === '残卷', 'fell back to default, name=' + r.name)
  assert(r.ids.includes('tree-keep'), 'tree dropped ' + r.ids.join(','))
  assert(r.clouds.includes('cloud-keep'), 'cloud dropped')
  assert(Math.abs(r.time - 6) < 1e-6, 'time ' + r.time)
  assert(!page.errors.some((e) => /pos|null/.test(e)), page.errors.join(' | '))
  await ctx.close()
})

await test('simulation offsets do not survive reset', async () => {
  const { ctx, page } = await boot({ query: '?fresh' })
  await frames(page, 2)
  const r = await page.evaluate(() => {
    const sims = window.__sims
    if (!sims || sims.size === 0) return { size: 0 }
    sims.forEach((s) => { s.off.y = 40; s.orbit = 2.5; s.off.x = 12 })
    window.__world.getState().resetWorld()
    const bench = sims.get('bench-0')
    return { size: sims.size, y: bench ? bench.off.y : null }
  })
  assert(r.size === 0, 'sims survived reset: size ' + r.size + ' benchY ' + r.y)
  await ctx.close()
})

await test('resizing inside desktop does not snap the camera back home', async () => {
  const { ctx, page } = await boot({ query: '?fresh&t=10' })
  await frames(page, 3)
  const home = await page.evaluate(() => window.__cam.position.toArray())
  // orbit by dragging empty sky
  await page.mouse.move(640, 180)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(640 - i * 40, 180 + i * 12)
    await frames(page, 1)
  }
  await page.mouse.up()
  await frames(page, 3)
  const moved = await page.evaluate(() => window.__cam.position.toArray())
  const dist = Math.hypot(moved[0] - home[0], moved[1] - home[1], moved[2] - home[2])
  assert(dist > 1.5, 'camera did not move before resize, dist ' + dist.toFixed(2))
  await page.setViewportSize({ width: 1100, height: 760 })
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const after = await page.evaluate(() => window.__cam.position.toArray())
  const back = Math.hypot(after[0] - home[0], after[1] - home[1], after[2] - home[2])
  const kept = Math.hypot(after[0] - moved[0], after[1] - moved[1], after[2] - moved[2])
  assert(back > 1, `resize snapped toward home (homeΔ ${back.toFixed(2)}, movedΔ ${kept.toFixed(2)})`)
  await ctx.close()
})

await test('a second pointer cannot end or retarget an object drag', async () => {
  const { ctx, page } = await boot({ query: '?fresh&t=10' })
  await frames(page, 2)
  await page.evaluate(() => window.__world.getState().updateObject('bench-0', { pos: [0, 1.2, -18] }))
  await frames(page, 2)
  const hit = await page.evaluate(() => {
    const cam = window.__cam
    cam.updateMatrixWorld()
    const bench = window.__world.getState().objects.find((o) => o.id === 'bench-0')
    const v = { x: bench.pos[0], y: bench.pos[1] + 0.6, z: bench.pos[2] }
    const e = cam.matrixWorldInverse.elements, pe = cam.projectionMatrix.elements
    const vx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]
    const vy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]
    const vz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]
    const cx = pe[0] * vx + pe[4] * vy + pe[8] * vz + pe[12]
    const cy = pe[1] * vx + pe[5] * vy + pe[9] * vz + pe[13]
    const cw = pe[3] * vx + pe[7] * vy + pe[11] * vz + pe[15]
    const r = document.querySelector('.stage canvas').getBoundingClientRect()
    return { x: r.left + (cx / cw * 0.5 + 0.5) * r.width, y: r.top + (-cy / cw * 0.5 + 0.5) * r.height, behind: cw < 0, pos: bench.pos }
  })
  assert(!hit.behind && hit.y > 90 && hit.y < 660, 'bench still under UI ' + JSON.stringify(hit))
  await page.mouse.move(hit.x, hit.y)
  await page.mouse.down()
  await frames(page, 1)
  const dragging = await page.evaluate(() => window.__world.getState().dragging)
  assert(dragging, 'pointer down on bench did not start a drag at ' + JSON.stringify(hit))
  const pos0 = await page.evaluate(() => window.__world.getState().objects.find((o) => o.id === 'bench-0').pos.slice())
  const stolen = await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 77, clientX: 20, clientY: 20, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, clientX: 20, clientY: 20, bubbles: true }))
    const s = window.__world.getState()
    return { dragging: s.dragging, pos: s.objects.find((o) => o.id === 'bench-0').pos.slice() }
  })
  assert(stolen.dragging, 'foreign pointerup ended the drag')
  const jumped = Math.hypot(stolen.pos[0] - pos0[0], stolen.pos[2] - pos0[2])
  assert(jumped < 0.5, 'foreign pointermove moved the bench by ' + jumped.toFixed(2))
  await page.mouse.up()
  await ctx.close()
})

await test('sun-dial drag does not stick after the sun glyph unmounts at the horizon', async () => {
  const { ctx, page } = await boot({ query: '?fresh&t=19.7' })
  await page.waitForSelector('.sun-knob', { timeout: 10000 })
  const box = await page.locator('.sun-knob').boundingBox()
  assert(box, 'no sun knob')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.evaluate(() => window.__world.getState().setTime(22, 'drag'))
  await page.waitForSelector('.moon', { timeout: 5000 })
  // release far from the dial; capture was on the (now unmounted) knob
  await page.mouse.move(8, 8)
  await page.mouse.up()
  const before = await page.evaluate(() => window.__world.getState().time)
  const svg = await page.locator('.dial-svg').boundingBox()
  await page.mouse.move(svg.x + svg.width * 0.3, svg.y + svg.height * 0.5)
  const after = await page.evaluate(() => window.__world.getState().time)
  assert(Math.abs(after - before) < 0.01, `dial still dragging: ${before} → ${after}`)
  await ctx.close()
})

await test('deleting a placed tree disposes its cloned geometries', async () => {
  const { ctx, page } = await boot({ query: '?fresh&t=10' })
  await frames(page, 2)
  const before = await page.evaluate(() => window.__renderer.info.memory.geometries)
  await page.evaluate(() => {
    const id = window.__world.getState().addObject('tree', [6, 0, 8])
    window.__probeId = id
  })
  await page.waitForFunction((n0) => window.__renderer.info.memory.geometries > n0 + 1, before, { timeout: 30000 })
  await frames(page, 2)
  const mid = await page.evaluate(() => window.__renderer.info.memory.geometries)
  await page.evaluate(() => window.__world.getState().removeObject(window.__probeId))
  await frames(page, 3)
  const after = await page.evaluate(() => window.__renderer.info.memory.geometries)
  assert(after <= before + 1, `geometries leaked: before ${before} mid ${mid} after ${after}`)
  await ctx.close()
})

await test('addObject stops at 400 so a reload cannot silently drop the newest one', async () => {
  const { ctx, page } = await boot({ query: '?fresh' })
  const r = await page.evaluate(() => {
    let guard = 0
    while (window.__world.getState().objects.length < 400 && guard < 450) {
      window.__world.getState().addObject('rock', [0, 1, 0])
      guard++
    }
    const atCap = window.__world.getState().objects.length
    const extra = window.__world.getState().addObject('rock', [2, 1, 0])
    return { atCap, extra, after: window.__world.getState().objects.length }
  })
  assert(r.atCap === 400, 'did not fill to 400, got ' + r.atCap)
  assert(r.extra === '' && r.after === 400, '401st object was accepted ' + JSON.stringify(r))
  await ctx.close()
})

await test('mobile selection bar keeps delete reachable at 320px', async () => {
  const { ctx, page } = await boot({ viewport: { width: 320, height: 700 }, mobile: true, query: '?fresh' })
  await page.evaluate(() => window.__world.getState().select('house-0'))
  await page.waitForSelector('[data-testid=selection-bar]')
  const r = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid=selection-bar]')
    const del = bar.querySelector('[data-act="删除"]')
    const b = del.getBoundingClientRect()
    return { w: innerWidth, left: b.left, right: b.right, sw: bar.scrollWidth, cw: bar.clientWidth }
  })
  assert(r.right <= r.w + 1 && r.left >= -1, `delete clipped ${JSON.stringify(r)}`)
  await ctx.close()
})

await test('malformed share hash shows an error and keeps the default world', async () => {
  const { ctx, page } = await boot({ query: '?fresh#w=zzzzzz' })
  await page.waitForFunction(() => document.body.innerText.includes('分享链接无法解析'), null, { timeout: 10000 })
  const name = await page.evaluate(() => window.__world.getState().name)
  assert(name === '我的世界', 'name ' + name)
  await ctx.close()
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
