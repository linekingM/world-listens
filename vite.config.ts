import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// split heavy vendor code into cacheable chunks (three / react-three / postprocessing / react)
// PAGES_BASE=/world-listens/ for the GitHub Pages build; local dev/preview stay at /
export default defineConfig({
  base: process.env.PAGES_BASE || '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 30 },
            { name: 'postfx', test: /node_modules[\\/](postprocessing|@react-three[\\/]postprocessing|n8ao)/, priority: 25 },
            { name: 'r3f', test: /node_modules[\\/](@react-three|three-stdlib|troika|camera-controls|maath|meshline|@monogrid|stats|suspend-react|its-fine|zustand)/, priority: 20 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 15 },
            { name: 'vendor', test: /node_modules/, priority: 1 },
          ],
        },
      },
    },
  },
})
