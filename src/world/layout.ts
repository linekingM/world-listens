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
  for (const side of [-1, 1]) {
    let z = 12 - r() * 6
    while (z > -255) {
      const n = [1, 3, 3, 5][Math.floor(r() * 4)]
      const kind = r() < 0.62 ? 0 : r() < 0.7 ? 2 : 1 // a clump shares a species
      for (let k = 0; k < n; k++) {
        const zz = z - k * (3.2 + r() * 1.6)
        const x = roadX(zz) + side * (ROAD_WIDTH / 2 + 2.8 + r() * 4.5 + (k % 2) * 2.2)
        out.push({ x, z: zz, y: 0, s: 0.75 + r() * 0.65, kind: r() < 0.8 ? kind : (r() < 0.5 ? 1 : 0), tint: r(), rot: r() * 6.28 })
      }
      z -= n * 3.6 + 7 + r() * 12 // open meadow gaps between clumps
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

/** 0 flat block (parapet, maybe roof garden) · 1 slender tower · 2 domed hall · 3 pitched/hip terracotta roof
 *  4 terraced setbacks with gardens · 5 clock/bell tower · 6 cathedral (landmark) */
export interface Building { x: number; z: number; w: number; d: number; h: number; tone: number; kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 }

export function cityBuildings(): Building[] {
  const r = rng(21)
  const out: Building[] = []
  const cx = roadX(ROAD_END) * 0.5
  for (let z = -315; z > -500; z -= 9 + r() * 6) {
    for (let x = -190; x < 190; x += 8 + r() * 7) {
      const dx = (x - cx) / 110, dz = (z + 390) / 75
      const core = Math.exp(-(dx * dx + dz * dz))
      if (r() < 0.22 - core * 0.15) continue
      if (Math.abs(x - roadX(z) * 0.4) < 6 && z > -330) continue // avenue entering the city
      // keep the landmark plots clear
      if (Math.hypot(x - (cx + 26), z + 385) < 12 || Math.hypot(x - (cx - 30), z + 405) < 22 || Math.hypot(x - (cx + 62), z + 362) < 8) continue
      const h = 8 + core * (14 + r() * 28) + r() * 6
      const roll = r()
      const kind: Building['kind'] = h > 30 && roll < 0.16 ? 1 : roll < 0.5 ? 3 : roll < 0.6 && h > 16 ? 4 : roll < 0.66 ? 2 : 0
      out.push({ x: x + r() * 3, z, w: 6 + r() * 6, d: 6 + r() * 6, h, tone: r(), kind })
    }
  }
  // landmarks: an elegant campanile on the avenue axis, a domed cathedral, a clock tower, two slender towers
  out.push({ x: cx + 26, z: -385, w: 8, d: 8, h: 82, tone: 0.42, kind: 5 })
  out.push({ x: cx - 30, z: -405, w: 30, d: 36, h: 28, tone: 0.15, kind: 6 })
  out.push({ x: cx + 62, z: -362, w: 6, d: 6, h: 40, tone: 0.7, kind: 5 })
  out.push({ x: cx - 78, z: -380, w: 7, d: 7, h: 66, tone: 0.3, kind: 1 })
  out.push({ x: cx + 96, z: -420, w: 7, d: 7, h: 62, tone: 0.8, kind: 1 })
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
    pos: [-46, 31, -104], radius: 14, depth: 23, seed: 3, waterfall: true,
    houses: [
      { x: -2, z: 1, rot: 0.4, s: 1.15, kind: 'house' },
      { x: 4, z: -2.6, rot: -0.3, s: 1.0, kind: 'tower' },
      { x: 3, z: 4, rot: 1.2, s: 0.8, kind: 'house' },
    ],
    trees: [{ x: -6, z: -3.5, s: 1 }, { x: -7, z: 2.6, s: 0.8 }, { x: 0, z: -6, s: 0.9 }, { x: 7, z: 2, s: 0.7 }, { x: -3.5, z: 6, s: 0.75 }],
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

/** Small islands for user-created / cloud-born islands (variants 3..5). */
export const SMALL_ISLANDS: IslandSpec[] = [
  { pos: [0, 0, 0], radius: 6.5, depth: 11, seed: 31, houses: [{ x: 0, z: 0, rot: 0.3, s: 0.9, kind: 'house' }], trees: [{ x: 3.5, z: 1.5, s: 0.7 }, { x: -3, z: -2, s: 0.6 }] },
  { pos: [0, 0, 0], radius: 5.5, depth: 9, seed: 37, houses: [], trees: [{ x: 0, z: 0, s: 1 }, { x: 2.8, z: -1.5, s: 0.6 }, { x: -2.5, z: 1.8, s: 0.7 }] },
  { pos: [0, 0, 0], radius: 6, depth: 12, seed: 43, waterfall: true, houses: [{ x: -0.5, z: -0.5, rot: 1.1, s: 0.8, kind: 'tower' }], trees: [{ x: 3, z: 2, s: 0.6 }] },
]

export function islandSpec(variant: number): IslandSpec {
  return variant < ISLANDS.length ? ISLANDS[variant] : SMALL_ISLANDS[(variant - ISLANDS.length) % SMALL_ISLANDS.length]
}

export interface CloudSpec { pos: [number, number, number]; scale: number; seed: number }

const keepSunsetWindow = (c: CloudSpec) => {
  const az = THREE_DEG * Math.atan2(c.pos[0] - 8, -(c.pos[2] - 38))
  return Math.abs(az - SUNSET_VIEW_AZ) > 10 || c.pos[1] > 115
}

/** Static far cloud banks + a low "sea of clouds" around the mountain feet (scenery, driven by weather). */
export function horizonClouds(): CloudSpec[] {
  const r = rng(99)
  const out: CloudSpec[] = []
  for (let i = 0; i < 9; i++) {
    const x = -420 + i * 105 + r() * 40
    out.push({ pos: [x, 60 + r() * 35, -640 - r() * 120], scale: 2.2 + r() * 1.2, seed: i })
  }
  return out.filter(keepSunsetWindow)
}

/** Low, flat cloud sea lying in the far valleys beyond the city. */
export function cloudSea(): CloudSpec[] {
  const r = rng(321)
  const out: CloudSpec[] = []
  for (let i = 0; i < 12; i++) out.push({ pos: [-650 + i * 120 + r() * 50, 10 + r() * 8, -560 - r() * 260], scale: 2.4 + r() * 1.0, seed: 60 + i })
  return out
}

/** Interactive clouds the user can drag (seeded into the world document). */
export function heroClouds(): CloudSpec[] {
  const r = rng(77)
  const out: CloudSpec[] = []
  for (let i = 0; i < 7; i++) out.push({ pos: [-260 + i * 85 + r() * 30, 85 + r() * 30, -300 - r() * 120], scale: 1.2 + r() * 0.8, seed: 20 + i })
  for (let i = 0; i < 3; i++) out.push({ pos: [-150 + i * 140 + r() * 30, 120 + r() * 20, -200 - r() * 60], scale: 0.9 + r() * 0.4, seed: 40 + i })
  return out.filter(keepSunsetWindow)
}

/** Legacy: all clouds (used by the B/C prototype styles). */
export function cloudSpecs(): CloudSpec[] {
  return [...horizonClouds(), ...heroClouds()]
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
