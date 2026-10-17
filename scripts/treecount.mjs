import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { treeSpots } = await server.ssrLoadModule('/src/world/layout.ts')
const s = treeSpots()
const near = s.filter((t) => Math.hypot(t.x - 8, t.z - 38) < 150).length
console.log('total', s.length, 'within150', near, 'kinds', [0, 1, 2].map((k) => s.filter((t) => t.kind === k).length))
await server.close()
