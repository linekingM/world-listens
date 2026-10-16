import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto('file:///workspace/world-listens/docs/stitch/hud.html'); await p.waitForTimeout(4000)
await p.screenshot({ path: 'docs/stitch/hud-render.png' }); await b.close()
