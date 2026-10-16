import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'] });
const p = await b.newPage();
await p.setContent('<canvas id=c width=200 height=100></canvas><script>const g=document.getElementById("c").getContext("webgl2");window.r=g?g.getParameter(g.RENDERER)+" | "+g.getParameter(g.VERSION):"none";g.clearColor(0.2,0.6,0.9,1);g.clear(g.COLOR_BUFFER_BIT);</script>');
console.log(await p.evaluate(()=>window.r));
await p.screenshot({path:'/tmp/gl.png'}); await b.close();
