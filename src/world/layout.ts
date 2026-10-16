/**
 * Shared composition for every art direction: where the road goes, where trees,
 * city blocks, islands and clouds sit. Styles decide *how* things look; this file
 * decides *what* is where. Later the editable world state will be seeded from here.
 */
import { fbm, rng, smoothstep } from '../lib/random'

export const ROAD_START = 40
export const ROAD_END = -300
export const ROAD_WIDTH = 7.2

export function roadX(z: number) {
  return 7.5 * Math.sin(z * 0.0105 + 0.25) - 1.86 + 3.0 * Math.sin(z * 0.004)
}

/** Terrain height. Flat valley around the road, rolling meadows and hills beyond. */
export function terrainHeight(x: number, z: number) {
  const d = Math.abs(x - roadX(Math.max(z, ROAD_END - 40)))
  const valley = smoothstep(ROAD_WIDTH * 0.9, 70, d)
  const hills = fbm(x * 0.008 + 11, z * 0.008 - 3, 4)
  const ripple = fbm(x * 0.05, z * 0.05, 2) - 0.5
  // the city plateau is flat
  const cityMask = smoothstep(-265, -305, z) * (1 - smoothstep(170, 230, Math.abs(x)))
  let h = valley * (Math.pow(hills, 1.6) * 34 + ripple * 1.5) + (1 - valley) * ripple * 0.15
  // far sides rise into hills that frame the valley
  h += smoothstep(120, 380, Math.abs(x)) * 55 * hills
  h *= 1 - cityMask * 0.92
  return h - 0.05
}

export interface TreeSpot { x: number; z: number; y: number; s: number; kind: 0 | 1 | 2; tint: number; rot: number }

export function treeSpots(): TreeSpot[] {
  const r = rng(7)
  const out: TreeSpot[] = []
  // roadside avenue
  for (let z = 12; z > -255; z -= 8.5 + r() * 3) {
    for (const side of [-1, 1]) {
      if (r() < 0.18) continue
      const x = roadX(z) + side * (ROAD_WIDTH / 2 + 3.2 + r() * 2.5)
      out.push({ x, z: z + r() * 2, y: 0, s: 1.05 + r() * 0.45, kind: r() < 0.75 ? 0 : 2, tint: r(), rot: r() * 6.28 })
    }
  }
  // groves in the meadows
  let tries = 0
  while (out.length < 420 && tries < 9000) {
    tries++
    const x = (r() - 0.5) * 520
    const z = 14 - r() * 300
    const d = Math.abs(x - roadX(z))
    if (d < 13) continue
    if (fbm(x * 0.018 + 4, z * 0.018, 3) < 0.53) continue
    out.push({ x, z, y: 0, s: 0.85 + r() * 0.9, kind: r() < 0.45 ? 1 : r() < 0.7 ? 0 : 2, tint: r(), rot: r() * 6.28 })
  }
  for (const t of out) t.y = terrainHeight(t.x, t.z)
  return out
}

export interface Building { x: number; z: number; w: number; d: number; h: number; tone: number; kind: 0 | 1 | 2 }

export function cityBuildings(): Building[] {
  const r = rng(21)
  const out: Building[] = []
  const cx = roadX(ROAD_END) * 0.5
  for (let z = -315; z > -500; z -= 9 + r() * 6) {
    for (let x = -190; x < 190; x += 8 + r() * 7) {
      const dx = (x - cx) / 110, dz = (z + 390) / 75
      const core = Math.exp(-(dx * dx + dz * dz))
      if (r() < 0.25 - core * 0.2) continue
      if (Math.abs(x - roadX(z) * 0.4) < 6 && z > -330) continue // avenue entering the city
      const h = 5 + core * (20 + r() * 42) + r() * 8
      out.push({ x: x + r() * 3, z, w: 5 + r() * 6, d: 5 + r() * 6, h, tone: r(), kind: h > 48 && r() < 0.3 ? 1 : r() < 0.15 ? 2 : 0 })
    }
  }
  // landmark spire just right of the avenue
  out.push({ x: cx + 26, z: -385, w: 9, d: 9, h: 92, tone: 0.5, kind: 1 })
  out.push({ x: cx - 34, z: -410, w: 11, d: 11, h: 68, tone: 0.2, kind: 1 })
  return out
}

export interface IslandSpec {
  pos: [number, number, number]
  radius: number
  depth: number
  seed: number
  houses: { x: number; z: number; rot: number; s: number; kind: 'house' | 'tower' }[]
  trees: { x: number; z: number; s: number }[]
  waterfall?: boolean
}

export const ISLANDS: IslandSpec[] = [
  {
    pos: [-38, 25, -80], radius: 16, depth: 26, seed: 3, waterfall: true,
    houses: [
      { x: -2, z: 1, rot: 0.4, s: 1.2, kind: 'house' },
      { x: 4.5, z: -3, rot: -0.3, s: 1.0, kind: 'tower' },
      { x: 3.5, z: 4.5, rot: 1.2, s: 0.8, kind: 'house' },
    ],
    trees: [{ x: -7, z: -4, s: 1 }, { x: -8, z: 3, s: 0.8 }, { x: 0, z: -7, s: 0.9 }, { x: 8, z: 2, s: 0.7 }, { x: -4, z: 7, s: 0.75 }],
  },
  {
    pos: [44, 37, -128], radius: 12.5, depth: 20, seed: 9,
    houses: [{ x: 0, z: 0, rot: -0.6, s: 1.3, kind: 'house' }, { x: -4.5, z: 3, rot: 0.3, s: 0.8, kind: 'house' }],
    trees: [{ x: 5, z: -3, s: 0.9 }, { x: 4, z: 4, s: 0.7 }, { x: -5, z: -4, s: 0.8 }],
  },
  {
    pos: [4, 56, -215], radius: 9, depth: 14, seed: 15,
    houses: [{ x: 0, z: 0, rot: 0.2, s: 1.1, kind: 'tower' }],
    trees: [{ x: 4, z: 2, s: 0.8 }, { x: -4, z: -2, s: 0.8 }, { x: -2, z: 4, s: 0.6 }],
  },
]

const THREE_DEG = 180 / Math.PI
/** azimuth (deg) of the ~18:30 sun as seen from the hero camera */
const SUNSET_VIEW_AZ = 18

export interface CloudSpec { pos: [number, number, number]; scale: number; seed: number }

export function cloudSpecs(): CloudSpec[] {
  const r = rng(99)
  const out: CloudSpec[] = []
  // horizon banks behind the city
  for (let i = 0; i < 9; i++) {
    const x = -420 + i * 105 + r() * 40
    const c: CloudSpec = { pos: [x, 55 + r() * 35, -620 - r() * 120], scale: 2.2 + r() * 1.2, seed: i }
    out.push(c)
  }
  // mid layer
  for (let i = 0; i < 7; i++) out.push({ pos: [-260 + i * 85 + r() * 30, 85 + r() * 30, -300 - r() * 120], scale: 1.2 + r() * 0.8, seed: 20 + i })
  // a few high, nearer clouds for parallax
  for (let i = 0; i < 3; i++) out.push({ pos: [-150 + i * 140 + r() * 30, 120 + r() * 20, -200 - r() * 60], scale: 0.9 + r() * 0.4, seed: 40 + i })
  // keep a clear window where the evening sun sets (seen from the hero camera)
  return out.filter((c) => {
    const az = THREE_DEG * Math.atan2(c.pos[0] - 8, -(c.pos[2] - 38))
    return Math.abs(az - SUNSET_VIEW_AZ) > 10 || c.pos[1] > 115
  })
}

/** Street lamps along the road (they glow at night). */
export function lampSpots() {
  const out: { x: number; z: number; side: number }[] = []
  let side = 1
  for (let z = 26; z > -250; z -= 22) {
    out.push({ x: roadX(z) + side * (ROAD_WIDTH / 2 + 0.9), z, side })
    side *= -1
  }
  return out
}
