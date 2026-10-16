// Usage: node scripts/snap.mjs <name> [query] [mobile] [js-to-run-before-shot] [waitMs]
import { chromium } from 'playwright'
const [name, query = '', mobile = '', js = '', wait = '1500'] = process.argv.slice(2)
const base = process.env.BASE || 'http://127.0.0.1:4173'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } })
if (!process.env.HINT) await ctx.addInitScript(() => localStorage.setItem('world-listens.hint', '1'))
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const t0 = Date.now()
await p.goto(`${base}/${query}`)
await p.waitForFunction(() => (window.__frames ?? 0) > 30, null, { timeout: 180000 }).catch(() => errs.push('timeout'))
if (js) { await p.evaluate(js); }
const f0 = await p.evaluate(() => window.__frames)
await p.waitForFunction(([f, w]) => window.__frames > f + w, [f0, Math.round(Number(wait) / 100)], { timeout: 240000 }).catch(() => errs.push('timeout2'))
await p.screenshot({ path: `shots/${name}.png` })
console.log(`shots/${name}.png ${((Date.now() - t0) / 1000).toFixed(1)}s`, errs.join(' | '))
await b.close()
