import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 800, height: 500 } })
p.on('pageerror', (e) => console.log('PAGEERROR', e.stack))
p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()) })
await p.goto((process.env.BASE||'http://127.0.0.1:5173') + '/' + (process.argv[2]||'?style=a&t=8'))
await p.waitForFunction(() => (window.__frames ?? 0) > 10, null, { timeout: 120000 }).catch(()=>console.log('timeout'))
await b.close()
