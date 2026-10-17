/**
 * Procedural geometry builders shared by every art direction. Each builder bakes
 * vertex colours from a style palette, and can optionally produce faceted
 * (low‑poly) output.
 */
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fbm, noise2, rng, smoothstep, clamp } from '../lib/random'
import { roadX, terrainHeight, ROAD_START, ROAD_END, ROAD_WIDTH, AVENUE_END, GATE_Z, GATE_OPENING, PIAZZA, type Building, type IslandSpec } from './layout'

export interface WorldPalette {
  grassA: string; grassB: string; grassDry: string; grassFar: string
  dirt: string; rock: string; rockDark: string
  road: string; roadLine: string; curb: string
  trunk: string; leaf: string[]; conifer: string
  wall: string[]; roof: string[]
  cityA: string; cityB: string; cityTop: string
  mountain: string; mountainSnow: string; water: string
  /** optional discrete facade colours (toy-like cities) */
  cityTints?: string[]
  /** optional patchwork farmland colours */
  fields?: string[]
}

export interface BuildOpts { lowPoly: boolean; palette: WorldPalette }

const C = new THREE.Color()
const C2 = new THREE.Color()
const col = (hex: string) => new THREE.Color(hex)

function setColors(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void) {
  const pos = geo.getAttribute('position')
  const nor = geo.getAttribute('normal')
  const arr = new Float32Array(pos.count * 3)
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    if (nor) n.fromBufferAttribute(nor, i)
    fn(p, n, c)
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

/** Make faceted: every triangle gets its own vertices + flat normal. */
export function facet(geo: THREE.BufferGeometry) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.computeVertexNormals()
  return g
}

function solidColor(geo: THREE.BufferGeometry, hex: string | THREE.Color) {
  const c = typeof hex === 'string' ? col(hex) : hex
  return setColors(geo, (_p, _n, o) => o.copy(c))
}

/** Strip every attribute except position/normal/color(/uv) so geometries can be merged. */
function normalizeAttrs(geo: THREE.BufferGeometry, keepUv = false) {
  const g = geo.index ? geo.toNonIndexed() : geo
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', ...(keepUv ? ['uv'] : [])].includes(k)) g.deleteAttribute(k)
  return g
}

// ───────────────────────────── terrain ─────────────────────────────
export function buildTerrain({ lowPoly, palette }: BuildOpts) {
  const size = 1500
  const seg = lowPoly ? 150 : 260
  const geo = new THREE.PlaneGeometry(size, size, seg, seg)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, 0, -330)
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    pos.setY(i, terrainHeight(x, z))
  }
  let g: THREE.BufferGeometry = geo
  if (lowPoly) g = facet(geo)
  else g.computeVertexNormals()
  const ga = col(palette.grassA), gb = col(palette.grassB), dry = col(palette.grassDry), far = col(palette.grassFar), dirt = col(palette.dirt)
  return setColors(g, (p, n, o) => {
    const v = fbm(p.x * 0.02, p.z * 0.02, 3)
    o.copy(ga).lerp(gb, smoothstep(0.35, 0.7, v))
    // dry patches on hilltops and in stripes like fields
    const field = noise2(p.x * 0.006 + 30, p.z * 0.02) * smoothstep(0.4, 0.8, fbm(p.x * 0.01 - 8, p.z * 0.01, 2))
    const fieldAmt = clamp(field * 0.9 + smoothstep(8, 40, p.y) * 0.35)
    o.lerp(dry, lowPoly ? smoothstep(0.28, 0.34, fieldAmt) * 0.85 : fieldAmt)
    if (palette.fields) {
      // patchwork farmland: rotated grid of plots, each a flat colour
      const ang = 0.35, u = p.x * Math.cos(ang) - p.z * Math.sin(ang), w = p.x * Math.sin(ang) + p.z * Math.cos(ang)
      const cu = Math.floor(u / 34), cw = Math.floor(w / 22)
      const hsh = Math.abs(Math.sin(cu * 12.9898 + cw * 78.233) * 43758.5453) % 1
      const farm = fbm(p.x * 0.007 + 40, p.z * 0.007 - 12, 2)
      const dRoad = Math.abs(p.x - roadX(Math.max(p.z, ROAD_END - 40)))
      if (farm > 0.44 && hsh < 0.75 && dRoad > 14 && n.y > 0.8) o.copy(C2.set(palette.fields[Math.floor(hsh * 10) % palette.fields.length]))
    }
    // distant meadows fade toward an airy tone
    o.lerp(far, smoothstep(-120, -420, p.z) * 0.55)
    // steep slopes show dirt
    o.lerp(dirt, smoothstep(0.86, 0.6, n.y) * 0.6)
    // inside the walls the ground is warm stone paving, not meadow
    const town = smoothstep(ROAD_END - 2, ROAD_END - 14, p.z) * (1 - smoothstep(180, 210, Math.abs(p.x)))
    if (town > 0) o.lerp(C2.set('#cbb18c').multiplyScalar(0.86 + fbm(p.x * 0.2, p.z * 0.2, 2) * 0.22), town * 0.92)
    // soft darkening right next to the road (worn verge)
    const d = Math.abs(p.x - roadX(Math.max(p.z, ROAD_END - 40)))
    if (p.z > ROAD_END) o.lerp(dirt, (1 - smoothstep(ROAD_WIDTH / 2, ROAD_WIDTH / 2 + 2.5, d)) * 0.35)
  })
}

// ───────────────────────────── road ─────────────────────────────
function ribbon(offsetA: number, offsetB: number, zFrom: number, zTo: number, step: number, lift: number, dash?: [number, number]) {
  const pos: number[] = []
  const idx: number[] = []
  const uv: number[] = []
  let v = 0
  const emitQuadStrip = (za: number, zb: number) => {
    const base = pos.length / 3
    let n = 0
    for (let z = za; z >= zb - 1e-6; z -= step) {
      const cx = roadX(z)
      const dz = 0.5
      const tx = roadX(z - dz) - cx, tz = -dz
      const len = Math.hypot(tx, tz)
      const nx = -tz / len, nz = tx / len // left-pointing normal
      const yA = Math.max(terrainHeight(cx + nx * offsetA, z + nz * offsetA), 0) + lift
      const yB = Math.max(terrainHeight(cx + nx * offsetB, z + nz * offsetB), 0) + lift
      pos.push(cx + nx * offsetA, yA, z + nz * offsetA, cx + nx * offsetB, yB, z + nz * offsetB)
      uv.push(0, v, 1, v)
      v += step / ROAD_WIDTH
      n++
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  if (!dash) emitQuadStrip(zFrom, zTo)
  else for (let z = zFrom; z > zTo; z -= dash[0] + dash[1]) emitQuadStrip(z, z - dash[0])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // ribbons are built right-to-left; make sure they face up
  const nor = g.getAttribute('normal')
  if (nor.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t } g.setIndex(idx); g.computeVertexNormals() }
  return g
}

const MOSS = new THREE.Color('#5f7038')
export function buildRoad({ palette }: BuildOpts) {
  const hw = ROAD_WIDTH / 2
  const road = ribbon(-hw, hw, ROAD_START, AVENUE_END, 1, 0.06)
  const asphalt = col(palette.road)
  setColors(road, (p, _n, o) => {
    // mottled flagstone: large soft patches + fine grain, mossy toward the edges
    const v = fbm(p.x * 0.35, p.z * 0.35, 3)
    const edge = smoothstep(hw - 1.6, hw, Math.abs(p.x - roadX(p.z)))
    o.copy(asphalt).multiplyScalar(0.84 + v * 0.3).lerp(MOSS, edge * 0.35 + smoothstep(0.62, 0.8, v) * 0.18)
  })
  const line = ribbon(-0.09, 0.09, ROAD_START, AVENUE_END, 1, 0.075, [3.2, 4.2])
  solidColor(line, palette.roadLine)
  const edgeL = ribbon(-hw + 0.25, -hw + 0.4, ROAD_START, AVENUE_END, 1, 0.075)
  const edgeR = ribbon(hw - 0.4, hw - 0.25, ROAD_START, AVENUE_END, 1, 0.075)
  const curbL = ribbon(-hw - 0.9, -hw, ROAD_START, ROAD_END, 1, 0.12)
  const curbR = ribbon(hw, hw + 0.9, ROAD_START, ROAD_END, 1, 0.12)
  for (const g of [edgeL, edgeR]) solidColor(g, palette.roadLine)
  for (const g of [curbL, curbR]) solidColor(g, palette.curb)
  void line
  const markings = mergeGeometries([edgeL, edgeR].map((g) => normalizeAttrs(g, false)))
  const curbs = mergeGeometries([curbL, curbR].map((g) => normalizeAttrs(g, false)))
  return { road, markings, curbs }
}

// ───────────────────────────── trees ─────────────────────────────
function blob(radius: number, detail: number, seed: number, lumpy = 0.22) {
  const g = new THREE.IcosahedronGeometry(radius, detail)
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = noise2(v.x * 1.7 + seed * 3.1, v.y * 1.7 + v.z * 1.3 + seed) - 0.5
    v.multiplyScalar(1 + n * lumpy)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  return g
}

/** A clump = a few overlapping lumpy blobs around a centre → layered, cauliflower-like canopy mass. */
function clump(cx: number, cy: number, cz: number, rad: number, n: number, seed: number, detail: number, lumpy: number, flat = 1) {
  const r = rng(seed * 13 + 7)
  const out: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : rad * (0.45 + r() * 0.35)
    const rr = i === 0 ? rad * 0.78 : rad * (0.42 + r() * 0.28)
    const b = blob(rr, detail, seed * 5 + i, lumpy)
    b.scale(1, flat, 1)
    b.translate(cx + Math.cos(a) * d, cy + (i === 0 ? 0 : (r() - 0.35) * rad * 0.7 * flat), cz + Math.sin(a) * d)
    out.push(b)
  }
  return out
}

function branch(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number, seg: number) {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0)
  const c = new THREE.CylinderGeometry(r1, r0, len, seg, 1)
  c.translate(0, len / 2, 0)
  const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()
  c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir))
  c.translate(x0, y0, z0)
  return c
}

/** Bake foliage colour: per-clump hue jitter, sun-side warm/light top, dark core (fake AO + translucency feel). */
function leafColors(g: THREE.BufferGeometry, base: THREE.Color, cx: number, cy: number, cz: number, h0: number, h1: number, seed: number) {
  const r = rng(seed)
  const tint = base.clone().offsetHSL((r() - 0.5) * 0.04, (r() - 0.5) * 0.12, (r() - 0.5) * 0.06)
  const warm = col('#e0c060')
  const sunDir = new THREE.Vector3(0.65, 0.45, 0.4).normalize()
  return setColors(g, (p, nn, o) => {
    const up = smoothstep(h0, h1, p.y)
    const outward = Math.hypot(p.x - cx, p.z - cz)
    const lit = Math.max(nn.dot(sunDir), 0)
    o.copy(tint).lerp(warm, lit * up * 0.36)
    o.multiplyScalar(0.36 + up * 0.5 + lit * 0.22 + Math.min(outward * 0.04, 0.1) + (noise2(p.x * 2.1 + seed, p.y * 2.3 + p.z) - 0.5) * 0.12)
    void cy
  })
}

/**
 * kind 0 = broadleaf (v0 wide oak, v1 tall layered elm, v2 umbrella/acacia),
 * kind 1 = conifer (v0 slender spruce, v1 broad fir, v2 tall scots pine),
 * kind 2 = column (v0/v1 poplar, v2 pale birch). One merged geometry with baked colours.
 */
export function buildTree(kind: 0 | 1 | 2, { lowPoly, palette }: BuildOpts, variant = 0) {
  const v = variant % 3
  const r = rng(100 + kind * 10 + variant)
  const parts: THREE.BufferGeometry[] = []
  const trunkC = col(palette.trunk)
  const detail = lowPoly ? 0 : 1
  const seg = lowPoly ? 5 : 7
  const lumpy = lowPoly ? 0.12 : 0.3
  const addLeaves = (geos: THREE.BufferGeometry[], base: THREE.Color, c: [number, number, number], h0: number, h1: number, seed: number) => {
    for (const [i, g] of geos.entries()) parts.push(leafColors(g, base, c[0], c[1], c[2], h0, h1, seed + i))
  }
  if (kind === 0) {
    const leaf = col(palette.leaf[v % palette.leaf.length])
    if (v === 0) {
      // wide oak: short thick trunk, 3 limbs, 4 clumps on a dome
      parts.push(solidColor(branch(0, 0, 0, 0.1, 2.2, 0, 0.36, 0.26, seg), trunkC))
      const limbs: [number, number, number][] = [[1.6, 3.6, 0.4], [-1.4, 3.4, 0.8], [0.2, 3.9, -1.5]]
      for (const l of limbs) parts.push(solidColor(branch(0.1, 2.0, 0, l[0], l[1], l[2], 0.2, 0.1, 5), trunkC))
      addLeaves(clump(0, 4.8, 0, 2.0, 6, 1 + variant, detail, lumpy, 1.0), leaf, [0, 4, 0], 2.5, 6, 11)
      for (const [i, l] of limbs.entries()) addLeaves(clump(l[0] * 1.15, l[1] + 0.5, l[2] * 1.1, 1.4, 4, 20 + i + variant, detail, lumpy, 1.0), leaf, [0, 4, 0], 2.5, 6, 30 + i)
    } else if (v === 1) {
      // tall layered elm: straight trunk, stacked tiers of clumps (gaps show sky)
      parts.push(solidColor(branch(0, 0, 0, 0, 3.6, 0, 0.24, 0.15, seg), trunkC))
      const tiers = [[3.1, 1.75], [4.4, 1.55], [5.6, 1.25], [6.6, 0.8]]
      for (const [i, [y, rad]] of tiers.entries()) {
        const a = r() * 6.28
        addLeaves(clump(Math.cos(a) * 0.4, y, Math.sin(a) * 0.4, rad, 5, 40 + i + variant, detail, lumpy, 0.72), leaf, [0, 4.5, 0], 2.6, 6.6, 50 + i)
      }
    } else {
      // umbrella / acacia: forked leaning trunk, broad flat canopy
      parts.push(solidColor(branch(0, 0, 0, 0.3, 2.4, 0.1, 0.24, 0.16, seg), trunkC))
      parts.push(solidColor(branch(0.3, 2.3, 0.1, 1.5, 3.7, 0.4, 0.15, 0.08, 5), trunkC))
      parts.push(solidColor(branch(0.3, 2.3, 0.1, -1.0, 3.8, -0.4, 0.15, 0.08, 5), trunkC))
      addLeaves(clump(0.3, 4.0, 0, 2.5, 7, 60 + variant, detail, lumpy, 0.42), leaf, [0.3, 4, 0], 3.4, 4.6, 61)
    }
  } else if (kind === 1) {
    const leaf = col(v === 0 ? '#22473a' : v === 1 ? '#3a6638' : '#5c6a36')
    const cfg = v === 0 ? { tiers: 6, base: 1.55, top: 0.35, y0: 1.0, h: 6.8, trunkH: 1.4 } : v === 1 ? { tiers: 4, base: 2.1, top: 0.6, y0: 0.8, h: 5.0, trunkH: 1.1 } : { tiers: 5, base: 1.15, top: 0.4, y0: 3.0, h: 4.2, trunkH: 3.4 }
    parts.push(solidColor(branch(0, 0, 0, 0, cfg.trunkH + 0.5, 0, 0.2, 0.12, seg), trunkC))
    for (let i = 0; i < cfg.tiers; i++) {
      const t = i / (cfg.tiers - 1)
      const rad = cfg.base + (cfg.top - cfg.base) * t
      const hh = (cfg.h / cfg.tiers) * 1.7
      const y = cfg.y0 + t * cfg.h * 0.82
      const cone = new THREE.ConeGeometry(rad, hh, lowPoly ? 7 : 11, 2, true)
      // jagged, drooping skirt: pull every rim vertex down/out by noise
      const pos = cone.getAttribute('position')
      for (let k = 0; k < pos.count; k++) {
        const px = pos.getX(k), py = pos.getY(k), pz = pos.getZ(k)
        if (py < 0) {
          const a = Math.atan2(pz, px)
          const j = noise2(a * 2.3 + i * 7 + v, 3.1) - 0.5
          const sc = 1 + j * 0.35
          pos.setXYZ(k, px * sc, py - Math.abs(j) * hh * 0.3 - (py < -hh * 0.45 ? 0.15 : 0), pz * sc)
        }
      }
      cone.computeVertexNormals()
      cone.translate((r() - 0.5) * 0.12, y + hh / 2, (r() - 0.5) * 0.12)
      const base = leaf.clone().offsetHSL(0, 0, (r() - 0.5) * 0.04)
      parts.push(setColors(cone, (p, nn, o) => {
        const lt = clamp((p.y - y) / hh)
        o.copy(base).multiplyScalar(0.5 + lt * 0.55 + t * 0.12 + Math.max(nn.y, 0) * 0.1)
      }))
      // cap the open cone underside with a dark disc so it never reads as hollow
      const cap = new THREE.CircleGeometry(rad * 0.9, lowPoly ? 7 : 11)
      cap.rotateX(Math.PI / 2); cap.translate(0, y + 0.05, 0)
      parts.push(solidColor(cap, base.clone().multiplyScalar(0.35)))
    }
  } else {
    if (v === 2) {
      // birch: pale slim trunk with dark marks, airy small clumps
      const bark = col('#d9d4c8')
      const trunk = branch(0, 0, 0, 0.15, 5.4, 0, 0.15, 0.08, seg)
      parts.push(setColors(trunk, (p, _n, o) => o.copy(bark).multiplyScalar(noise2(p.y * 3.1, 2.2) > 0.68 ? 0.35 : 1)))
      const leaf = col(palette.leaf[1]).offsetHSL(0.02, 0.05, 0.05)
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4, y = 3.0 + i * 0.75
        addLeaves(clump(Math.cos(a) * 0.7, y, Math.sin(a) * 0.7, 0.85 + (4 - i) * 0.06, 3, 80 + i, detail, lumpy, 0.8), leaf, [0, 4.5, 0], 2.5, 7, 81 + i)
      }
    } else {
      // poplar: column of stacked clumps tapering to a soft point
      parts.push(solidColor(branch(0, 0, 0, 0, 2.2, 0, 0.18, 0.12, seg), trunkC))
      const leaf = col(palette.leaf[(v + 1) % palette.leaf.length])
      const n = v === 0 ? 5 : 6
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1)
        const rad = 1.05 * (1 - t * 0.55) * (0.9 + r() * 0.2)
        addLeaves(clump((r() - 0.5) * 0.25, 2.4 + i * 0.78, (r() - 0.5) * 0.25, rad * 1.1, 4, 90 + i + v * 9, detail, lumpy, 1.25), leaf, [0, 4, 0], 1.8, 7.5, 91 + i)
      }
    }
  }
  let g = mergeGeometries(parts.map((p) => normalizeAttrs(p)))!
  if (lowPoly) g = facet(g)
  return g
}

// ───────────────────────────── floating island ─────────────────────────────
type IslandShape = 'spike' | 'tiered' | 'bulb' | 'twin'
const SHAPE_BY_SEED: Record<number, IslandShape> = { 3: 'tiered', 9: 'twin', 15: 'bulb', 31: 'spike', 37: 'bulb', 43: 'tiered' }

export function buildIsland(spec: IslandSpec, { lowPoly, palette }: BuildOpts) {
  const shape: IslandShape = SHAPE_BY_SEED[spec.seed] ?? (['spike', 'tiered', 'bulb', 'twin'] as const)[spec.seed % 4]
  const g0 = new THREE.IcosahedronGeometry(1, lowPoly ? 2 : 5)
  const g = g0.index ? g0.toNonIndexed() : g0
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3()
  const R = spec.radius, D = spec.depth
  const rimAt = (ang: number) => 0.82 + fbm(Math.cos(ang) * 1.6 + spec.seed, Math.sin(ang) * 1.6 + spec.seed, 3) * 0.36
  const lobeA = spec.seed * 1.7, lobeB = lobeA + 2.6
  const terr = (t: number, n: number) => { const k = t * n; return (Math.floor(k) + smoothstep(0.62, 1, k - Math.floor(k))) / n }
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const ang = Math.atan2(v.z, v.x)
    const rad = Math.hypot(v.x, v.z)
    const rim = rimAt(ang)
    if (v.y >= 0) {
      const y = v.y * 0.16 + (fbm(v.x * 2 + spec.seed, v.z * 2, 2) - 0.5) * 0.05
      pos.setXYZ(i, v.x * R * rim, y * R, v.z * R * rim)
      continue
    }
    const t = -v.y // 0 rim → 1 tip
    const jag = fbm(ang * 2.2 + spec.seed * 5, t * 3.5, 3)
    let taper: number, depth = 1
    let shiftX = 0, shiftZ = 0
    if (shape === 'tiered') {
      // cliffs and ledges: near-vertical walls broken by inward steps (layered strata)
      taper = Math.max(0, 1 - terr(t, 3) * 0.78 - Math.pow(t, 3) * 0.22)
      depth = 0.95
    } else if (shape === 'bulb') {
      taper = Math.pow(Math.max(0, 1 - t * t), 0.35) * (1 - smoothstep(0.55, 1, t) * 0.85)
      depth = 0.75
    } else if (shape === 'twin') {
      const la = Math.pow(Math.max(Math.cos(ang - lobeA), 0), 3), lb = Math.pow(Math.max(Math.cos(ang - lobeB), 0), 3)
      depth = 0.45 + Math.max(la, lb * 0.8) * 0.6
      taper = Math.pow(1 - t, 0.8)
      const pull = smoothstep(0.2, 1, t) * 0.38 * R
      const tA = la >= lb ? lobeA : lobeB
      shiftX = Math.cos(tA) * pull; shiftZ = Math.sin(tA) * pull
    } else {
      taper = Math.pow(1 - t, 0.9)
    }
    taper *= 1 + (jag * 0.5 - 0.25) * smoothstep(0, 0.3, t)
    const sy = -Math.pow(t, 1.1) * D * depth * (0.8 + jag * 0.4)
    // horizontal strata grooves (thin inset bands) so the rock reads as layered sediment
    const band = Math.abs(Math.sin(sy * 0.55 + spec.seed))
    taper *= 1 - smoothstep(0.78, 1, band) * 0.12 * smoothstep(0.02, 0.15, t)
    // fine rocky relief so smooth shading still reads as stone
    taper *= 1 + (fbm(ang * 5 + spec.seed, sy * 0.45, 3) - 0.5) * 0.14 * smoothstep(0.02, 0.2, t)
    const k = rad > 1e-4 && Math.sqrt(1 - t * t) > 1e-4 ? 1 / Math.sqrt(1 - t * t) : 0
    pos.setXYZ(i, v.x * k * taper * R * rim + shiftX, sy, v.z * k * taper * R * rim + shiftZ)
  }
  // weld duplicated vertices → smooth normals (soft cinematic rock instead of crude flat facets)
  g.deleteAttribute('normal'); if (g.getAttribute('uv')) g.deleteAttribute('uv')
  const gs = mergeVertices(g, 1e-3)
  gs.computeVertexNormals()
  const grass = col(palette.grassA), grass2 = col(palette.grassB), dirt = col(palette.dirt), rock = col(palette.rock), rockD = col(palette.rockDark)
  const sand = col('#d6b48c'), slate = col('#5d6c7c')
  const lipC = col('#e9c48e'), ochre = col('#c99a62'), rose = col('#a8644c'), baseC = col('#5e4a52'), baseD = col('#3c3445')
  setColors(gs, (p, n, o) => {
    if (p.y > -0.25 && n.y > 0.2) {
      o.copy(grass).lerp(grass2, fbm(p.x * 0.3 + spec.seed, p.z * 0.3, 2))
    } else {
      const t = clamp(-p.y / D)
      // three clear bands (wobbling boundaries): warm ochre sandstone lip -> rose/terracotta cliff -> dark cool tapered base
      const wob = noise2(Math.atan2(p.z, p.x) * 2 + spec.seed, 1.7) * 0.07
      const tb = t + wob
      o.copy(lipC).lerp(ochre, smoothstep(0.02, 0.07, tb))
        .lerp(rose, smoothstep(0.24, 0.32, tb))
        .lerp(baseC, smoothstep(0.55, 0.68, tb)).lerp(baseD, smoothstep(0.75, 1, tb))
      // faint sediment lines inside each band
      const b = Math.sin((p.y + wob * 12) * 0.9 + spec.seed)
      o.lerp(b > 0 ? sand : slate, smoothstep(0.75, 0.98, Math.abs(b)) * 0.22 * smoothstep(0.03, 0.12, t))
      void dirt; void rock; void rockD
      // dark seams under each ledge + mossy tops of ledges
      if (n.y < -0.35) o.multiplyScalar(0.62)
      if (n.y > 0.45 && t > 0.05) o.lerp(grass, 0.75)
      o.multiplyScalar(0.88 + noise2(p.y * 1.4, spec.seed) * 0.24)
    }
  })
  // hanging roots (bark) and vines (green, leafy tips) under the rim
  const extra: THREE.BufferGeometry[] = []
  const r = rng(spec.seed * 31 + 5)
  const sc = R / 16
  const rootC = col('#4a3628'), vineC = col('#4d6e2e'), leafA = col('#5f8a34'), leafB = col('#7a9c3e')
  const nRoots = Math.round(14 + R * 1.3)
  for (let i = 0; i < nRoots; i++) {
    const ang = r() * Math.PI * 2
    const rr = R * rimAt(ang) * (0.86 + r() * 0.08)
    let x = Math.cos(ang) * rr, z = Math.sin(ang) * rr, y = -0.25 - r() * 0.8 * sc
    const vine = r() < 0.6
    // vines: slender strands dotted with small leaf clusters; roots: short tapering bark tendrils
    const len = (vine ? 3.5 + r() * 6 : 1.4 + r() * 3) * sc
    const segs = vine ? 4 : 3
    let rad0 = (vine ? 0.055 : 0.13) * sc
    for (let k = 0; k < segs; k++) {
      const out = (r() - 0.3) * (vine ? 0.35 : 0.5) * sc
      const nx = x + Math.cos(ang) * out + (r() - 0.5) * 0.35 * sc, nz = z + Math.sin(ang) * out + (r() - 0.5) * 0.35 * sc
      const ny = y - len / segs
      const rad1 = rad0 * (vine ? 0.85 : 0.6)
      extra.push(solidColor(branch(x, y, z, nx, ny, nz, rad0, rad1, vine ? 3 : 4), vine ? vineC : rootC))
      if (vine) for (let j = 0; j < 2; j++) {
        const f = 0.3 + j * 0.45, s0 = (0.2 + r() * 0.12) * sc * (1 - k * 0.12)
        const lf = blob(s0, 0, 300 + i * 9 + k * 2 + j, 0.35)
        lf.scale(1.2, 0.8, 1.2)
        lf.translate(x + (nx - x) * f + (r() - 0.5) * 0.25 * sc, y + (ny - y) * f, z + (nz - z) * f + (r() - 0.5) * 0.25 * sc)
        extra.push(solidColor(lf, (k + j) % 2 ? leafA : leafB))
      }
      x = nx; y = ny; z = nz; rad0 = rad1
    }
    if (vine) {
      const tip = blob(0.26 * sc, 0, 200 + i, 0.3)
      tip.scale(1, 1.4, 1); tip.translate(x, y + 0.1 * sc, z)
      extra.push(solidColor(tip, leafB))
    }
  }
  const merged = mergeGeometries([normalizeAttrs(gs), ...extra.map((e) => normalizeAttrs(e))])!
  return lowPoly ? facet(merged) : merged
}

// ───────────────────────────── houses ─────────────────────────────
export function buildHouse(kind: 'house' | 'tower', variant: number, { lowPoly, palette }: BuildOpts) {
  const wall = col(palette.wall[variant % palette.wall.length])
  const roof = col(palette.roof[variant % palette.roof.length])
  const parts: THREE.BufferGeometry[] = []
  if (kind === 'house') {
    const body = new THREE.BoxGeometry(2.4, 1.7, 1.9)
    body.translate(0, 0.85, 0)
    parts.push(setColors(body, (p, _n, o) => o.copy(wall).multiplyScalar(0.82 + (p.y / 1.7) * 0.2)))
    const s = new THREE.Shape()
    s.moveTo(-1.42, 0); s.lineTo(1.42, 0); s.lineTo(0, 1.25); s.closePath()
    const roofG = new THREE.ExtrudeGeometry(s, { depth: 2.25, bevelEnabled: false })
    roofG.translate(0, 1.68, -1.125)
    roofG.rotateY(Math.PI / 2)
    parts.push(solidColor(roofG, roof))
    const chim = new THREE.BoxGeometry(0.32, 0.8, 0.32)
    chim.translate(0.55, 2.55, 0.5)
    parts.push(solidColor(chim, C.copy(wall).multiplyScalar(0.8)))
    // door + windows as slightly darker inset boxes
    const door = new THREE.BoxGeometry(0.42, 0.75, 0.05)
    door.translate(-0.4, 0.38, 0.97)
    parts.push(solidColor(door, C2.copy(roof).multiplyScalar(0.55)))
    for (const x of [0.45]) {
      const w = new THREE.BoxGeometry(0.45, 0.4, 0.05)
      w.translate(x, 0.95, 0.97)
      parts.push(solidColor(w, '#3d4d63'))
    }
  } else {
    const body = new THREE.CylinderGeometry(0.85, 1.0, 4.2, lowPoly ? 7 : 16)
    body.translate(0, 2.1, 0)
    parts.push(setColors(body, (p, _n, o) => o.copy(wall).multiplyScalar(0.8 + (p.y / 4.2) * 0.25)))
    const ring = new THREE.CylinderGeometry(1.1, 1.1, 0.25, lowPoly ? 7 : 16)
    ring.translate(0, 4.25, 0)
    parts.push(solidColor(ring, C.copy(wall).multiplyScalar(0.9)))
    const cone = new THREE.ConeGeometry(1.3, 2.4, lowPoly ? 7 : 16)
    cone.translate(0, 5.55, 0)
    parts.push(solidColor(cone, roof))
    for (let i = 0; i < 3; i++) {
      const w = new THREE.BoxGeometry(0.3, 0.5, 0.05)
      w.translate(0, 1.4 + i * 1.0, 0.92)
      w.rotateY(i * 2.1)
      parts.push(solidColor(w, '#3d4d63'))
    }
  }
  let g = mergeGeometries(parts.map((p) => normalizeAttrs(p)))!
  if (lowPoly) g = facet(g)
  return g
}

// ───────────────────────────── city ─────────────────────────────
const STONE = ['#ecdcc0', '#e4c9a2', '#d9b48c', '#f0e6d3', '#dcbf98', '#cf9d76', '#e8d2b0']
const TERRACOTTA = ['#c2563a', '#b04c33', '#d06a3e', '#a8452f', '#c97c4a']
const COPPER = '#5ea58e', GARDEN = '#6c8a46', CREAM = '#f4ecd8', WATER = '#9cc8e6'

export function buildCity(list: Building[], { lowPoly }: BuildOpts) {
  const parts: THREE.BufferGeometry[] = []
  const push = (geo: THREE.BufferGeometry, c: THREE.Color | string, shade?: (p: THREE.Vector3, n: THREE.Vector3, o: THREE.Color) => void) => {
    const cc = typeof c === 'string' ? col(c) : c.clone()
    setColors(geo, shade ? (p, n, o) => { o.copy(cc); shade(p, n, o) } : (_p, _n, o) => o.copy(cc))
    parts.push(normalizeAttrs(zeroUv(geo), true))
  }
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g }
  const seg = lowPoly ? 6 : 14
  /** facade box with window UVs at a consistent world density */
  const facadeBox = (bd: { x: number; z: number; w: number; d: number; tone: number }, h: number, y0: number, base: THREE.Color) => {
    const g = new THREE.BoxGeometry(bd.w, h, bd.d)
    g.translate(bd.x, y0 + h / 2, bd.z)
    const uv = g.getAttribute('uv'), nor = g.getAttribute('normal')
    for (let i = 0; i < uv.count; i++) {
      const sideX = Math.abs(nor.getX(i)) > 0.5, sideY = Math.abs(nor.getY(i)) > 0.5
      const w = sideX ? bd.d : bd.w
      uv.setXY(i, sideY ? 0 : (uv.getX(i) * w / 3.2 + bd.tone * 13.7) / 4, sideY ? 0 : (uv.getY(i) * h / 3.4 + Math.floor(bd.tone * 97)) / 4)
    }
    setColors(g, (p, n, o) => { o.copy(base).multiplyScalar(0.74 + clamp((p.y - y0) / 40) * 0.26); if (n.y > 0.5) o.multiplyScalar(0.92) })
    parts.push(normalizeAttrs(g, true))
  }
  const hipRoof = (x: number, y: number, z: number, w: number, d: number, c: string, steep = 0.42) => {
    const g = new THREE.ConeGeometry(Math.SQRT1_2 * 1.08, 1, 4, 1)
    g.rotateY(Math.PI / 4); g.scale(w, Math.min(w, d) * steep, d); g.translate(x, y + Math.min(w, d) * steep / 2, z)
    push(g, c, (p, _n, o) => o.multiplyScalar(0.85 + noise2(p.x * 0.7, p.z * 0.7) * 0.25))
  }
  const bushes = (x: number, y: number, z: number, w: number, d: number, n: number, seed: number) => {
    const r = rng(seed)
    for (let i = 0; i < n; i++) { const b = blob(0.9 + r() * 0.8, 0, seed + i, 0.3); b.translate(x + (r() - 0.5) * w * 0.7, y + 0.6, z + (r() - 0.5) * d * 0.7); push(b, GARDEN, (p, _n, o) => o.multiplyScalar(0.8 + noise2(p.x, p.z) * 0.4)) }
  }
  const capCone = (x: number, y: number, z: number, r0: number, h: number, c: string, sides = seg) => { const g = new THREE.ConeGeometry(r0, h, sides); g.translate(x, y + h / 2, z); push(g, c) }
  const clockFaces = (x: number, y: number, z: number, half: number, rad: number) => {
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2
      const disc = new THREE.CircleGeometry(rad, 16); disc.rotateY(a); disc.translate(x + Math.sin(a) * (half + 0.05), y, z + Math.cos(a) * (half + 0.05))
      push(disc, CREAM)
      const hub = new THREE.CircleGeometry(rad * 0.18, 8); hub.rotateY(a); hub.translate(x + Math.sin(a) * (half + 0.08), y, z + Math.cos(a) * (half + 0.08))
      push(hub, '#3b3430')
    }
  }
  for (const bd of list) {
    const terr = terrainHeight(bd.x, bd.z)
    const base = col(STONE[Math.floor(bd.tone * 97) % STONE.length])
    const roofC = TERRACOTTA[Math.floor(bd.tone * 53) % TERRACOTTA.length]
    if (bd.kind === 0 || bd.kind === 3 || bd.kind === 2) {
      facadeBox(bd, bd.h, terr, base)
      const top = terr + bd.h
      if (bd.kind === 3) hipRoof(bd.x, top, bd.z, bd.w * 1.06, bd.d * 1.06, roofC)
      else if (bd.kind === 2) {
        const r0 = Math.min(bd.w, bd.d) * 0.42
        const drum = new THREE.CylinderGeometry(r0 * 0.95, r0 * 0.95, r0 * 0.5, seg); drum.translate(bd.x, top + r0 * 0.25, bd.z); push(drum, base)
        const dome = new THREE.SphereGeometry(r0, seg, lowPoly ? 4 : 8, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 1.15, 1); dome.translate(bd.x, top + r0 * 0.5, bd.z)
        push(dome, bd.tone > 0.5 ? COPPER : roofC)
      } else {
        // parapet + either a roof garden or a small rooftop pavilion
        push(box(bd.w + 0.4, 0.8, bd.d + 0.4, bd.x, top, bd.z), base.clone().multiplyScalar(0.9))
        if (bd.tone > 0.45) { push(box(bd.w - 0.6, 0.3, bd.d - 0.6, bd.x, top + 0.2, bd.z), GARDEN); bushes(bd.x, top + 0.3, bd.z, bd.w, bd.d, 3, Math.floor(bd.tone * 1000)) }
        else { push(box(bd.w * 0.4, 2.4, bd.d * 0.4, bd.x, top, bd.z), base); hipRoof(bd.x, top + 2.4, bd.z, bd.w * 0.46, bd.d * 0.46, roofC) }
      }
    } else if (bd.kind === 4) {
      // terraced: three setbacks, each terrace planted
      let w = bd.w * 1.2, d = bd.d * 1.2, y = terr
      const hs = [bd.h * 0.45, bd.h * 0.33, bd.h * 0.22]
      for (let k = 0; k < 3; k++) {
        facadeBox({ ...bd, w, d }, hs[k], y, base)
        y += hs[k]
        push(box(w - 0.4, 0.3, d - 0.4, bd.x, y, bd.z), GARDEN)
        bushes(bd.x, y + 0.2, bd.z, w, d, 2 + k, Math.floor(bd.tone * 977) + k * 7)
        w *= 0.7; d *= 0.7
      }
    } else if (bd.kind === 1) {
      // elegant slender tower: tapered shaft, balcony ring, lantern, copper needle cap
      const r0 = bd.w * 0.5
      const shaft = new THREE.CylinderGeometry(r0 * 0.72, r0, bd.h, seg); shaft.translate(bd.x, terr + bd.h / 2, bd.z)
      push(shaft, base, (p, _n, o) => o.multiplyScalar(0.84 + clamp((p.y - terr) / bd.h) * 0.2 + (Math.sin((p.y - terr) * 0.9) > 0.92 ? -0.12 : 0)))
      const ring = new THREE.CylinderGeometry(r0 * 1.05, r0 * 1.05, 0.7, seg); ring.translate(bd.x, terr + bd.h, bd.z); push(ring, CREAM)
      const lantern = new THREE.CylinderGeometry(r0 * 0.55, r0 * 0.6, 3.2, seg); lantern.translate(bd.x, terr + bd.h + 2, bd.z); push(lantern, base)
      capCone(bd.x, terr + bd.h + 3.6, bd.z, r0 * 0.66, bd.h * 0.22, COPPER)
    } else if (bd.kind === 5) {
      // clock / bell tower: square shaft, cornice, clock faces, open belfry, pyramid cap
      const s = bd.w
      facadeBox(bd, bd.h * 0.78, terr, base)
      const yC = terr + bd.h * 0.78
      push(box(s * 1.18, 0.9, s * 1.18, bd.x, yC, bd.z), CREAM)
      clockFaces(bd.x, yC - 2.6, bd.z, s / 2, s * 0.32)
      // belfry: four corner piers
      const ph = bd.h * 0.12
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) push(box(s * 0.24, ph, s * 0.24, bd.x + sx * s * 0.38, yC + 0.9, bd.z + sz * s * 0.38), base)
      const bell = new THREE.SphereGeometry(s * 0.2, 10, 6); bell.translate(bd.x, yC + 0.9 + ph * 0.45, bd.z); push(bell, '#8a6a3a')
      push(box(s * 1.1, 0.7, s * 1.1, bd.x, yC + 0.9 + ph, bd.z), CREAM)
      const cap = new THREE.ConeGeometry(s * 0.78, bd.h * 0.2, 4); cap.rotateY(Math.PI / 4); cap.translate(bd.x, yC + 1.6 + ph + bd.h * 0.1, bd.z); push(cap, bd.tone > 0.5 ? COPPER : roofC)
    } else if (bd.kind === 6) {
      // cathedral: long nave with terracotta roof, transept, drum + ribbed dome + lantern
      facadeBox(bd, bd.h, terr, base)
      hipRoof(bd.x, terr + bd.h, bd.z, bd.w * 1.04, bd.d * 1.04, '#b25d3e', 0.3)
      facadeBox({ ...bd, w: bd.w * 1.6, d: bd.d * 0.36 }, bd.h * 0.9, terr, base)
      const r0 = bd.w * 0.42, yD = terr + bd.h + 3
      const drum = new THREE.CylinderGeometry(r0, r0 * 1.04, 7, seg * 2); drum.translate(bd.x, yD + 3.5, bd.z); push(drum, base, (p, _n, o) => { const a = Math.atan2(p.z - bd.z, p.x - bd.x); if (Math.sin(a * 8) > 0.6 && p.y > yD + 2 && p.y < yD + 5.5) o.multiplyScalar(0.45) })
      const dome = new THREE.SphereGeometry(r0 * 1.02, seg * 2, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 1.25, 1); dome.translate(bd.x, yD + 7, bd.z)
      push(dome, '#c0643f', (p, _n, o) => { const a = Math.atan2(p.z - bd.z, p.x - bd.x); if (Math.abs(Math.sin(a * 4)) > 0.96) o.set(CREAM) })
      const lan = new THREE.CylinderGeometry(1.3, 1.5, 3.2, 10); lan.translate(bd.x, yD + 7 + r0 * 1.25 + 1.2, bd.z); push(lan, CREAM)
      capCone(bd.x, yD + 7 + r0 * 1.25 + 2.8, bd.z, 1.4, 3.6, COPPER, 10)
    }
  }
  // city gate: a stucco wall with an arched passage between two towers, turned to the road's heading
  {
    const W = GATE_OPENING, ys = 4.6, H = ys + W / 2 + 3.2, X = W / 2 + 3.2, D = 4.6, T = 5.6, TH = H + 5.5
    const gx = roadX(GATE_Z), gy = Math.max(terrainHeight(gx, GATE_Z), 0) - 0.2
    const parts0 = parts.length
    const wallC = col('#e6cfa6'), towerC = col('#dcbf98')
    const sh = new THREE.Shape()
    sh.moveTo(-X, 0); sh.lineTo(-W / 2, 0); sh.lineTo(-W / 2, ys)
    sh.absarc(0, ys, W / 2, Math.PI, 0, true)
    sh.lineTo(W / 2, 0); sh.lineTo(X, 0); sh.lineTo(X, H); sh.lineTo(-X, H); sh.closePath()
    const wall = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: lowPoly ? 8 : 18 })
    wall.translate(0, 0, -D / 2)
    // soffit and passage walls a shade darker, a warm band of voussoirs around the arch on both faces
    push(wall, wallC, (p, n, o) => {
      const inArch = Math.abs(p.x) <= W / 2 + 0.01 && p.y <= ys + W / 2 + 0.01 && Math.abs(n.z) < 0.5
      if (inArch) o.multiplyScalar(0.72)
      else if (Math.abs(n.z) > 0.5) { const r = Math.hypot(p.x, Math.max(p.y - ys, 0)); if (r < W / 2 + 0.9 && p.y > ys - 0.01) o.lerp(col('#c98f62'), 0.55) }
      o.multiplyScalar(0.9 + noise2(p.x * 0.6, p.y * 0.6) * 0.14)
    })
    // cornice + crenellations along the wall top
    push(box(2 * X + 0.6, 0.6, D + 0.6, 0, H, 0), CREAM)
    for (let x = -X + 0.8; x <= X - 0.8; x += 1.9) push(box(1.0, 1.0, D * 0.9, x, H + 0.6, 0), wallC.clone().multiplyScalar(0.94))
    for (const sx of [-1, 1]) {
      const tx = sx * (X + T / 2 - 0.6)
      push(box(T, TH, T, tx, 0, 0), towerC, (p, _n, o) => o.multiplyScalar(0.8 + clamp(p.y / TH) * 0.22 + noise2(p.x * 0.5, p.y * 0.5) * 0.1))
      push(box(T + 0.7, 0.7, T + 0.7, tx, TH, 0), CREAM)
      push(box(T + 0.5, 0.4, T + 0.5, tx, TH * 0.55, 0), CREAM)
      // small dark slit windows facing the road
      for (const wy of [TH * 0.35, TH * 0.72]) push(box(0.55, 1.6, 0.1, tx, wy, T / 2 + 0.02), '#4a3a34')
      hipRoof(tx, TH + 0.7, 0, T + 0.9, T + 0.9, '#b8553a', 0.9)
    }
    const heading = Math.atan2(-(roadX(GATE_Z - 1) - roadX(GATE_Z + 1)), 2)
    const m = new THREE.Matrix4().makeRotationY(heading).setPosition(gx, gy, GATE_Z)
    for (let i = parts0; i < parts.length; i++) parts[i].applyMatrix4(m)
  }
  // piazza: paved disc, round basin, water, a slim column with a bowl that spills
  {
    const { x, z, r } = PIAZZA, y = Math.max(terrainHeight(x, z), 0)
    const pave = new THREE.CylinderGeometry(r, r, 0.14, 40); pave.translate(x, y + 0.02, z)
    push(pave, '#d8c09a', (p, _n, o) => { const k = Math.hypot(p.x - x, p.z - z); if (Math.abs(k - r * 0.62) < 0.35 || k > r - 0.6) o.set('#b89c78') })
    const rim = new THREE.CylinderGeometry(4.2, 4.4, 0.9, 32); rim.translate(x, y + 0.45, z); push(rim, CREAM)
    const water = new THREE.CylinderGeometry(3.85, 3.85, 0.1, 32); water.translate(x, y + 0.78, z); push(water, WATER)
    const col0 = new THREE.CylinderGeometry(0.42, 0.55, 3.2, 12); col0.translate(x, y + 2.2, z); push(col0, CREAM)
    const bowl = new THREE.CylinderGeometry(1.5, 0.5, 0.6, 20); bowl.translate(x, y + 3.9, z); push(bowl, CREAM)
    const spill = new THREE.CylinderGeometry(1.3, 1.6, 0.06, 20); spill.translate(x, y + 4.15, z); push(spill, WATER)
    const tip = new THREE.SphereGeometry(0.35, 10, 6); tip.translate(x, y + 4.6, z); push(tip, '#c7a46a')
  }
  // the one surreal touch: a broken stone aqueduct drifting above the rooftops, still carrying water
  {
    const ax = -70, az = -345, ay = terrainHeight(ax, az) + 58, len = 50, n = 6
    const parts0 = parts.length
    push(box(len, 2.6, 4.4, 0, 0, 0), '#e2c9a4')
    push(box(len - 1, 0.25, 2.2, 0, 2.6, 0), WATER)
    for (let k = 0; k <= n; k++) {
      const x = -len / 2 + (k * len) / n
      const ph = k === n ? 6 : 11.5
      push(box(2.2, ph, 4.0, x, -ph, 0), '#dcc29c')
      // arch soffit between piers
      if (k < n) { const arch = new THREE.CylinderGeometry(len / n / 2 - 1.1, len / n / 2 - 1.1, 4.0, 10, 1, true, Math.PI / 2, Math.PI); arch.rotateX(Math.PI / 2); arch.translate(x + len / n / 2, 0, 0); push(arch, '#cdb08a') }
      // torn earth clinging under each pier
      const rock = new THREE.ConeGeometry(2.6, 4 + (k % 3) * 1.5, 6); rock.rotateX(Math.PI); rock.translate(x, -16 - (k % 3) * 0.7, 0); push(rock, '#8a7562', (p, _n, o) => o.multiplyScalar(0.8 + noise2(p.x, p.y) * 0.3))
    }
    // the slab of torn ground it still stands on
    const slab = new THREE.BoxGeometry(len + 3, 2.2, 7, 12, 1, 3)
    const sp = slab.getAttribute('position')
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) < 0) sp.setY(i, sp.getY(i) - 1.5 - noise2(sp.getX(i) * 0.3, sp.getZ(i)) * 4)
    slab.computeVertexNormals(); slab.translate(0, -12.5, 0)
    push(slab, '#8f7863', (p, n, o) => { if (n.y > 0.6) o.set(GARDEN); o.multiplyScalar(0.85 + noise2(p.x * 0.5, p.y) * 0.25) })
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.03, 0.3, -0.06)).setPosition(ax, ay, az)
    for (let i = parts0; i < parts.length; i++) parts[i].applyMatrix4(m)
  }
  let g = mergeGeometries(parts)!
  if (lowPoly) g.computeVertexNormals()
  return g
}

function zeroUv(g: THREE.BufferGeometry) {
  const uv = g.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0, 0)
  return g
}

/** Canvas window texture: lit windows in the (unused) map alpha, used as emissive mask. */
export function windowTexture() {
  const s = 512, n = 32, c = s / n
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, s, s)
  const r = rng(5)
  for (let y = 0; y < n; y++) {
    // lights cluster in a few lived-in homes (blocks of 3x2 windows), the rest of the facade stays dark
    for (let x = 0; x < n; x++) {
      const bx = Math.floor(x / 3), by = Math.floor(y / 2)
      const home = ((Math.sin(bx * 12.9898 + by * 78.233) * 43758.5453) % 1 + 1) % 1
      const on = home > 0.76 ? r() < 0.85 : r() < 0.02
      const warm = r()
      ctx.fillStyle = on ? (warm > 0.95 ? `rgb(${190 + warm * 30},${215},${235})` : `rgb(${225 + warm * 30},${175 + warm * 45},${110 + warm * 60})`) : '#0b0d12'
      ctx.fillRect(x * c + 5, y * c + 3, c - 10, c - 8)
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Daytime facade: pale wall with a grid of slightly bluer, darker windows (multiplied over vertex colours). */
export function facadeTexture() {
  const s = 512, n = 32, c = s / n
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#f6f1e8'
  ctx.fillRect(0, 0, s, s)
  const r = rng(11)
  for (let y = 0; y < n; y++) {
    // faint storey band
    ctx.fillStyle = 'rgba(120,96,70,0.10)'; ctx.fillRect(0, y * c + c - 2, s, 2)
    for (let x = 0; x < n; x++) {
      const v = 70 + r() * 30
      ctx.fillStyle = `rgb(${v + 20},${v + 8},${v})`
      ctx.fillRect(x * c + 5, y * c + 3, c - 10, c - 8)
      // shutters / sill
      ctx.fillStyle = 'rgba(255,250,240,0.55)'; ctx.fillRect(x * c + 4, y * c + c - 5, c - 8, 1.5)
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// ───────────────────────────── distant mountains ─────────────────────────────
export function buildMountains({ lowPoly, palette }: BuildOpts) {
  const w = 2600, seg = lowPoly ? 90 : 300
  const geo = new THREE.PlaneGeometry(w, 260, seg, lowPoly ? 8 : 30)
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const yv = pos.getY(i) // -130..130 → depth
    const t = (yv + 130) / 260 // 0 front … 1 back
    const ridge = Math.pow(fbm(x * 0.0035 + 2, 1.3, 5), 2.2) * 150 * (0.4 + t * 0.9)
    const peakMask = smoothstep(0, 0.6, t) * smoothstep(1, 0.75, t)
    // a broad notch where the sun sets so the evening disc can reach the horizon
    const notch = 1 - 0.9 * Math.exp(-Math.pow((x - 330) / 230, 2))
    pos.setXYZ(i, x, ridge * peakMask * notch - 6, -yv)
  }
  geo.translate(0, 0, -900)
  let g: THREE.BufferGeometry = geo
  if (lowPoly) g = facet(geo)
  else g.computeVertexNormals()
  const m = col(palette.mountain), snow = col(palette.mountainSnow)
  return setColors(g, (p, n, o) => {
    o.copy(m).multiplyScalar(0.8 + n.y * 0.25)
    o.lerp(snow, smoothstep(150, 230, p.y) * smoothstep(0.4, 0.8, n.y))
  })
}

/** Old-town lantern post: iron plinth + tapered post with brass collars, curled shepherd's-hook arm and a caged
 *  lantern (its glowing glass is a separate mesh centred at (-0.82, 4.03, 0)). */
export function buildLamp({ lowPoly }: BuildOpts) {
  const seg = lowPoly ? 6 : 10
  const IRON = '#2b2723', BRASS = '#b48c4e'
  const parts: THREE.BufferGeometry[] = []
  const add = (geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0) => { geo.translate(x, y, z); solidColor(geo, c); parts.push(geo) }
  add(new THREE.CylinderGeometry(0.17, 0.26, 0.34, seg), IRON, 0, 0.17)
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, seg), BRASS, 0, 0.37)
  add(new THREE.CylinderGeometry(0.05, 0.085, 4.3, seg), IRON, 0, 2.5)
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.08, seg), BRASS, 0, 2.7)
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.07, seg), BRASS, 0, 4.42)
  add(new THREE.SphereGeometry(0.075, seg, 6), BRASS, 0, 4.72)
  // shepherd's hook arm + decorative curl
  const arc = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 4.42, 0), new THREE.Vector3(-0.15, 4.85, 0), new THREE.Vector3(-0.72, 4.85, 0), new THREE.Vector3(-0.82, 4.42, 0))
  add(new THREE.TubeGeometry(arc, lowPoly ? 8 : 16, 0.03, 6), IRON)
  add(new THREE.TorusGeometry(0.11, 0.016, 5, 14), IRON, -0.3, 4.52)
  // lantern: pyramid cap, corner bars, base plate
  add(new THREE.ConeGeometry(0.2, 0.17, 4).rotateY(Math.PI / 4), BRASS, -0.82, 4.33)
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 5), IRON, -0.82, 4.44)
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(new THREE.BoxGeometry(0.025, 0.44, 0.025), BRASS, -0.82 + dx * 0.11, 4.03, dz * 0.11)
  add(new THREE.CylinderGeometry(0.15, 0.09, 0.07, 4).rotateY(Math.PI / 4), BRASS, -0.82, 3.78)
  return mergeGeometries(parts.map((p) => normalizeAttrs(p)))!
}

/** Glowing lantern glass (pairs with buildLamp). */
export const lanternGlassGeo = () => new THREE.BoxGeometry(0.19, 0.4, 0.19)

// ───────────────────────────── rocks & street furniture ─────────────────────────────
export function buildRock(variant: number, { lowPoly, palette }: BuildOpts) {
  const g0 = new THREE.IcosahedronGeometry(1, lowPoly ? 1 : 2)
  const g = g0.toNonIndexed()
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3()
  const sx = [1.25, 0.9, 1.5][variant % 3], sy = [0.75, 1.05, 0.55][variant % 3]
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = fbm(v.x * 1.3 + variant * 4, v.y * 1.3 + v.z * 1.1, 3)
    // chunky facets: quantise the displacement
    const k = 0.72 + Math.round(n * 6) / 6 * 0.55
    pos.setXYZ(i, v.x * k * sx, Math.max(v.y * k * sy, -0.25) + 0.25 * sy, v.z * k)
  }
  g.computeVertexNormals()
  const rock = col(palette.rock), dark = col(palette.rockDark), moss = col(palette.grassA)
  return setColors(g, (p, n, o) => {
    o.copy(rock).lerp(dark, smoothstep(0.6, -0.2, p.y) * 0.5 + noise2(p.x * 3, p.z * 3) * 0.2)
    o.lerp(moss, smoothstep(0.55, 0.9, n.y) * 0.45)
  })
}

export function buildBench({ lowPoly }: BuildOpts) {
  const wood = col('#a8744a'), iron = col('#33383f')
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.BoxGeometry(2.2, 0.07, 0.16)
    slat.translate(0, 0.52, -0.2 + i * 0.2)
    parts.push(solidColor(slat, C.copy(wood).multiplyScalar(0.9 + i * 0.06)))
  }
  for (let i = 0; i < 2; i++) {
    const back = new THREE.BoxGeometry(2.2, 0.14, 0.06)
    back.translate(0, 0.78 + i * 0.22, -0.34)
    back.rotateX(0)
    parts.push(solidColor(back, wood))
  }
  for (const x of [-0.95, 0.95]) {
    const leg = new THREE.BoxGeometry(0.08, 0.52, 0.5)
    leg.translate(x, 0.26, -0.05)
    parts.push(solidColor(leg, iron))
    const up = new THREE.BoxGeometry(0.07, 0.62, 0.07)
    up.translate(x, 0.82, -0.36)
    parts.push(solidColor(up, iron))
  }
  let g = mergeGeometries(parts.map((p) => normalizeAttrs(p)))!
  if (lowPoly) g = facet(g)
  return g
}
