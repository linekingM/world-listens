/**
 * Honest visual QA shooter for world-listens.
 * Hits LIVE site by default. Does not change app code.
 * node scripts/qa-review.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'

const BASE = process.env.BASE || 'https://linekingm.github.io/world-listens'
const OUT = 'shots/qa-review'
mkdirSync(OUT, { recursive: true })

const b = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

const wait = async (p, n) => {
  const f0 = await p.evaluate(() => window.__frames ?? 0)
  await p.waitForFunction(([f0, n]) => (window.__frames ?? 0) > f0 + n, [f0, n], { timeout: 360000 })
}

const look = (p, pos, at) => p.evaluate(([pos, at]) => {
  window.__cam.position.set(...pos)
  const dx = at[0] - pos[0], dy = at[1] - pos[1], dz = at[2] - pos[2]
  if (window.__roam) {
    window.__roam.yaw = Math.atan2(-dx, -dz)
    window.__roam.pitch = Math.atan2(dy, Math.hypot(dx, dz))
    window.__roam.vel.set(0, 0, 0)
  } else {
    window.__cam.lookAt(...at)
  }
}, [pos, at])

async function open(viewport, query, opts = {}) {
  const ctx = await b.newContext({
    viewport,
    deviceScaleFactor: opts.dpr ?? 1,
    isMobile: !!opts.mobile,
    hasTouch: !!opts.mobile,
  })
  await ctx.addInitScript(() => {
    localStorage.setItem('world-listens.hint', '1')
    localStorage.setItem('world-listens.quality', 'medium')
  })
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push('PAGE ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('CON ' + m.text()) })
  const url = BASE.replace(/\/$/, '') + '/' + (query.startsWith('?') ? query : '?' + query)
  console.log('goto', url, viewport)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => (window.__frames ?? 0) > 20, null, { timeout: 360000 })
  return { ctx, page }
}

const meta = {}

// ─── 1. Default load daytime ───
{
  const { ctx, page } = await open({ width: 1280, height: 800 }, '?t=11&q=medium')
  await wait(page, 18)
  meta.dayDefault = await page.evaluate(() => {
    const s = window.__world.getState()
    const e = window.__env
    return {
      time: s.time, day: s.day, weather: s.weather, playing: s.playing,
      elev: e?.sun?.elevation, golden: e?.sun?.golden,
      sun: e?.light?.sun && [+e.light.sun.r.toFixed(3), +e.light.sun.g.toFixed(3), +e.light.sun.b.toFixed(3)],
      amb: e?.light?.amb && [+e.light.amb.r.toFixed(3), +e.light.amb.g.toFixed(3), +e.light.amb.b.toFixed(3)],
      errors: [],
      title: document.querySelector('.title-block')?.innerText?.slice(0, 80),
      hud: [...document.querySelectorAll('.title-block,.action-pill,.rail,.sun-dial')].map(el => {
        const r = el.getBoundingClientRect()
        return { cls: el.className.slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), l: Math.round(r.left) }
      }),
    }
  })
  meta.dayDefault.errors = page.errors.slice(0, 10)
  await page.screenshot({ path: `${OUT}/01-default-day.png` })
  console.log('01 default day', JSON.stringify(meta.dayDefault))
  await ctx.close()
}

// ─── 2. Golden hour / sunset close on sun ───
{
  const { ctx, page } = await open({ width: 1280, height: 800 }, '?t=17.9&q=medium')
  await page.evaluate(() => window.__world.getState().setCamMode('roam'))
  await page.waitForFunction(() => !!window.__roam)
  // close on sun
  await page.evaluate(() => {
    const d = window.__env.sun.dir
    window.__cam.position.set(-d.x * 45, Math.max(6, d.y * 45 + 4), 18 - d.z * 45)
    window.__roam.yaw = Math.atan2(-d.x, -d.z)
    window.__roam.pitch = Math.asin(Math.max(-0.85, Math.min(0.85, d.y)))
    window.__roam.vel.set(0, 0, 0)
  })
  await wait(page, 16)
  meta.golden = await page.evaluate(() => {
    const e = window.__env
    return {
      time: window.__world.getState().time,
      elev: +e.sun.elevation.toFixed(2),
      golden: +e.sun.golden.toFixed(3),
      sun: [+e.light.sun.r.toFixed(3), +e.light.sun.g.toFixed(3), +e.light.sun.b.toFixed(3)],
      sunIntensity: e.light?.sunIntensity ?? e.sun?.intensity,
    }
  })
  await page.screenshot({ path: `${OUT}/02a-golden-sun-close.png` })
  console.log('02a golden', JSON.stringify(meta.golden))

  // deeper sunset
  await page.evaluate(() => window.__world.getState().setTime(18.7, 'drag'))
  await wait(page, 18)
  await page.evaluate(() => {
    const d = window.__env.sun.dir
    window.__cam.position.set(10, 5, 30)
    window.__roam.yaw = Math.atan2(-d.x, -d.z)
    window.__roam.pitch = Math.asin(Math.max(-0.15, Math.min(0.45, d.y))) * 0.9
    window.__roam.vel.set(0, 0, 0)
  })
  await wait(page, 14)
  meta.sunset = await page.evaluate(() => {
    const e = window.__env
    return {
      time: window.__world.getState().time,
      elev: +e.sun.elevation.toFixed(2),
      golden: +e.sun.golden.toFixed(3),
      sun: [+e.light.sun.r.toFixed(3), +e.light.sun.g.toFixed(3), +e.light.sun.b.toFixed(3)],
    }
  })
  await page.screenshot({ path: `${OUT}/02b-sunset-horizon.png` })
  console.log('02b sunset', JSON.stringify(meta.sunset))

  // sun behind island (occlusion check)
  const a = await page.evaluate(() => {
    let sun = null
    window.__scene.traverse((o) => { if (o.isDirectionalLight && !sun) sun = o })
    const d = sun.position.clone().sub(sun.target.position).normalize()
    const I = [44, 39, -128], D = 160
    return { I, cam: [I[0] - d.x * D, I[1] - d.y * D, I[2] - d.z * D] }
  })
  await look(page, a.cam, a.I)
  await wait(page, 16)
  await page.screenshot({ path: `${OUT}/02c-sun-behind-island.png` })
  console.log('02c behind island cam', a.cam.map(n => +n.toFixed(1)))
  await ctx.close()
}

// ─── 3. Night along path ───
{
  const { ctx, page } = await open({ width: 1280, height: 800 }, '?t=22&q=medium')
  await page.evaluate(() => {
    const s = window.__world.getState()
    s.setWeather('clear'); s.setGravity(1); s.setTime(22, 'drag')
  })
  // wait for fireflies chance to resolve
  try {
    await page.waitForFunction(() => (window.__fireflies ?? 0) > 0.5, null, { timeout: 120000 })
  } catch {
    console.log('fireflies not triggered, forcing night clear and waiting more')
    await page.evaluate(() => window.__world.getState().setTime(22.5, 'drag'))
    await wait(page, 40)
  }
  await wait(page, 14)
  meta.nightWide = await page.evaluate(() => ({
    time: window.__world.getState().time,
    fireflies: window.__fireflies,
    elev: window.__env?.sun?.elevation,
  }))
  await page.screenshot({ path: `${OUT}/03a-night-wide.png` })
  console.log('03a night wide', JSON.stringify(meta.nightWide))

  await page.evaluate(() => window.__world.getState().setCamMode('roam'))
  await page.waitForFunction(() => !!window.__roam)
  await look(page, [2, 3.2, 8], [0, 2, -90])
  await wait(page, 16)
  await page.screenshot({ path: `${OUT}/03b-night-path.png` })
  // farther along path
  await look(page, [4, 4, -40], [2, 2, -140])
  await wait(page, 16)
  await page.screenshot({ path: `${OUT}/03c-night-path-far.png` })
  console.log('03b/c path shots done')
  await ctx.close()
}

// ─── 4. Waterfall day + night close ───
{
  const { ctx, page } = await open({ width: 1280, height: 800 }, '?t=14&q=medium')
  await page.evaluate(() => window.__world.getState().setCamMode('roam'))
  await page.waitForFunction(() => !!window.__roam)
  await wait(page, 8)
  const foot = await page.evaluate(() => window.__fallFoot || [40, 8, -120])
  meta.fallFoot = foot
  await look(page, [foot[0] + 18, foot[1] + 4, foot[2] + 22], [foot[0], foot[1] + 10, foot[2]])
  await wait(page, 16)
  await page.screenshot({ path: `${OUT}/04a-waterfall-day.png` })

  await page.evaluate(() => window.__world.getState().setTime(22, 'drag'))
  await wait(page, 20)
  await look(page, [foot[0] + 16, foot[1] + 3, foot[2] + 20], [foot[0], foot[1] + 9, foot[2]])
  await wait(page, 16)
  meta.waterfallNight = await page.evaluate(() => {
    // sample materials near waterfall if exposed
    return { time: window.__world.getState().time, foot: window.__fallFoot }
  })
  await page.screenshot({ path: `${OUT}/04b-waterfall-night.png` })
  console.log('04 waterfall', JSON.stringify(meta.waterfallNight))
  await ctx.close()
}

// ─── 5. Mobile 390x844 roam collapsed chip ───
{
  const { ctx, page } = await open({ width: 390, height: 844 }, '?t=15&q=medium', { mobile: true })
  await page.evaluate(() => window.__world.getState().setCamMode('roam'))
  await page.waitForFunction(() => !!window.__roam)
  await wait(page, 12)
  // ensure collapsed
  await page.evaluate(() => {
    // if open, click toggle or wait — force class check
  })
  // wait for auto-collapse if it opens expanded
  await page.waitForTimeout(4500)
  meta.mobileRoam = await page.evaluate(() => {
    const hud = document.querySelector('[data-testid=roam-hud]')
    const keys = document.querySelector('[data-testid=roam-keys]')
    const joy = document.querySelector('[data-testid=roam-joystick]')
    const r = hud?.getBoundingClientRect()
    return {
      collapsed: hud?.classList.contains('is-collapsed'),
      open: hud?.classList.contains('is-open'),
      hasKeys: !!keys,
      joy: joy ? (() => { const b = joy.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), b: Math.round(innerHeight - b.bottom), l: Math.round(b.left) } })() : null,
      hudBox: r ? { w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), l: Math.round(r.left), text: hud.innerText?.slice(0, 120) } : null,
      coverage: (() => {
        let area = 0
        for (const s of ['.title-block', '.action-pill', '.rail', '.sun-dial', '.roam-hint', '.joystick', '.roam-btn']) {
          for (const el of document.querySelectorAll(s)) {
            const rr = el.getBoundingClientRect()
            area += rr.width * rr.height
          }
        }
        return +(area / (innerWidth * innerHeight) * 100).toFixed(1)
      })(),
    }
  })
  await page.screenshot({ path: `${OUT}/05-mobile-roam.png` })
  console.log('05 mobile', JSON.stringify(meta.mobileRoam))
  await ctx.close()
}

// ─── 6. Clouds drift (two frames) + day 0 vs day 1 ───
{
  const { ctx, page } = await open({ width: 1280, height: 800 }, '?t=12&q=medium')
  await page.evaluate(() => {
    const s = window.__world.getState()
    s.setPlaying(false)
    s.setTime(12, 'drag')
    // ensure day 0
    if (typeof s.setDay === 'function') s.setDay(0)
  })
  await wait(page, 10)
  // sample cloud mesh positions if possible
  const sampleClouds = () => page.evaluate(() => {
    const day = window.__world.getState().day
    let softClouds = 0
    const samplePos = []
    window.__scene?.traverse((o) => {
      if (o.type === 'Group' && o.children && o.children.length > 2 && o.position.y > 30) {
        softClouds++
        if (samplePos.length < 6) samplePos.push([+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)])
      }
    })
    return { day, softClouds, samplePos, time: window.__world.getState().time, playing: window.__world.getState().playing }
  })

  // look up at sky / horizon clouds
  await page.evaluate(() => window.__world.getState().setCamMode('roam'))
  await page.waitForFunction(() => !!window.__roam)
  await look(page, [0, 18, 40], [30, 40, -80])
  await wait(page, 12)
  meta.cloudsA = await sampleClouds()
  await page.screenshot({ path: `${OUT}/06a-clouds-t0.png` })

  // wait real ~3.5s wall time for drift (play off — clouds should still drift with wall clock)
  await page.waitForTimeout(3500)
  await wait(page, 8)
  meta.cloudsB = await sampleClouds()
  await page.screenshot({ path: `${OUT}/06b-clouds-t3s.png` })
  console.log('06 clouds t0/t3', JSON.stringify({ a: meta.cloudsA, b: meta.cloudsB }))

  // day 1: advance day
  await page.evaluate(() => {
    const s = window.__world.getState()
    if (typeof s.setDay === 'function') s.setDay(1)
    else {
      // cross midnight via time play burst
      s.setTime(23.9, 'drag')
      s.setPlaying(true)
      s.setPlayRate?.(2) // if exists
    }
  })
  // try setDay via store patch
  await page.evaluate(() => {
    const s = window.__world.getState()
    if (s.day === 0) {
      // force day bump in zustand
      window.__world.setState({ day: 1 })
    }
  })
  await wait(page, 24)
  meta.cloudsDay1 = await sampleClouds()
  await page.screenshot({ path: `${OUT}/06c-clouds-day1.png` })
  console.log('06c day1', JSON.stringify(meta.cloudsDay1))
  await ctx.close()
}

// ─── 7. Time play before/after ~3s ───
{
  const { ctx, page } = await open({ width: 1280, height: 800 }, '?t=16&q=medium')
  await wait(page, 12)
  meta.playBefore = await page.evaluate(() => {
    const s = window.__world.getState()
    const e = window.__env
    return {
      time: +s.time.toFixed(3),
      playing: s.playing,
      rate: s.playRate,
      elev: +e.sun.elevation.toFixed(2),
      sun: [+e.light.sun.r.toFixed(3), +e.light.sun.g.toFixed(3), +e.light.sun.b.toFixed(3)],
      dial: document.querySelector('[data-testid=dial-time]')?.textContent,
    }
  })
  await page.screenshot({ path: `${OUT}/07a-timeplay-before.png` })

  await page.evaluate(() => {
    const s = window.__world.getState()
    s.setPlaying(true)
    // default rate should be 0.5h per second = 0.5
  })
  // wall-clock ~3.2s
  await page.waitForTimeout(3200)
  await wait(page, 4)
  meta.playAfter = await page.evaluate(() => {
    const s = window.__world.getState()
    const e = window.__env
    return {
      time: +s.time.toFixed(3),
      playing: s.playing,
      rate: s.playRate,
      elev: +e.sun.elevation.toFixed(2),
      sun: [+e.light.sun.r.toFixed(3), +e.light.sun.g.toFixed(3), +e.light.sun.b.toFixed(3)],
      dial: document.querySelector('[data-testid=dial-time]')?.textContent,
    }
  })
  await page.screenshot({ path: `${OUT}/07b-timeplay-after.png` })
  meta.playDelta = +(meta.playAfter.time - meta.playBefore.time).toFixed(3)
  console.log('07 timeplay', JSON.stringify({ before: meta.playBefore, after: meta.playAfter, deltaH: meta.playDelta }))
  await ctx.close()
}

writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2))
console.log('DONE shots →', OUT)
await b.close()
