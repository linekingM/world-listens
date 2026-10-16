// Usage: node scripts/shoot.mjs [base=http://localhost:5173] [specs...]
// spec: <style>:<time>[:mobile]  e.g. a:8 a:18.5 a:8:mobile
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:5173'
const specs = process.argv.slice(2).length ? process.argv.slice(2) : ['a:8', 'a:18.5', 'b:8', 'b:18.5', 'c:8', 'c:18.5', 'a:8:mobile']
const name = (s, t) => ({ 8: 'morning', 18.5: 'sunset', 12.5: 'noon', 22: 'night', 6: 'dawn' })[t] ?? `t${t}`
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
})
for (const spec of specs) {
  const [style, t, mobile] = spec.split(':')
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  const t0 = Date.now()
  await page.goto(`${base}/?style=${style}&t=${t}${process.env.EXTRA || ''}`, { waitUntil: 'load' })
  await page.waitForFunction(() => (window.__frames ?? 0) > 40, null, { timeout: 180000 }).catch(() => errors.push('timeout waiting frames'))
  await page.waitForTimeout(800)
  const file = `shots/${style.toUpperCase()}-${name(style, Number(t))}${mobile ? '-mobile' : ''}.png`
  await page.screenshot({ path: file })
  const frames = await page.evaluate(() => window.__frames)
  console.log(file, `${((Date.now() - t0) / 1000).toFixed(1)}s frames=${frames}`, errors.slice(0, 5).join(' | '))
  await ctx.close()
}
await browser.close()
