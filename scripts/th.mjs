import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', root: '/workspace/world-listens' })
const { terrainHeight } = await server.ssrLoadModule('/src/world/layout.ts')
for (const [x, z] of [[13, 29], [6, 20], [30, 0], [4, 18]]) console.log(x, z, terrainHeight(x, z).toFixed(2))
await server.close()
