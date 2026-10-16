/**
 * Procedural geometry builders shared by every art direction. Each builder bakes
 * vertex colours from a style palette, and can optionally produce faceted
 * (low‑poly) output.
 */
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fbm, noise2, rng, smoothstep, clamp } from '../lib/random'
import { roadX, terrainHeight, ROAD_START, ROAD_END, ROAD_WIDTH, type Building, type IslandSpec } from './layout'

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
  const road = ribbon(-hw, hw, ROAD_START, ROAD_END, 1, 0.06)
  const asphalt = col(palette.road)
  setColors(road, (p, _n, o) => {
    // mottled flagstone: large soft patches + fine grain, mossy toward the edges
    const v = fbm(p.x * 0.35, p.z * 0.35, 3)
    const edge = smoothstep(hw - 1.6, hw, Math.abs(p.x - roadX(p.z)))
    o.copy(asphalt).multiplyScalar(0.84 + v * 0.3).lerp(MOSS, edge * 0.35 + smoothstep(0.62, 0.8, v) * 0.18)
  })
  const line = ribbon(-0.09, 0.09, ROAD_START, ROAD_END, 1, 0.075, [3.2, 4.2])
  solidColor(line, palette.roadLine)
  const edgeL = ribbon(-hw + 0.25, -hw + 0.4, ROAD_START, ROAD_END, 1, 0.075)
  const edgeR = ribbon(hw - 0.4, hw - 0.25, ROAD_START, ROAD_END, 1, 0.075)
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
  setColors(gs, (p, n, o) => {
    if (p.y > -0.25 && n.y > 0.2) {
      o.copy(grass).lerp(grass2, fbm(p.x * 0.3 + spec.seed, p.z * 0.3, 2))
    } else {
      const t = clamp(-p.y / D)
      o.copy(dirt).lerp(rock, smoothstep(0.02, 0.22, t)).lerp(rockD, smoothstep(0.45, 1, t))
      // sediment bands: alternating warm sandstone / cool slate layers, wobbling along the rim
      const wob = noise2(Math.atan2(p.z, p.x) * 2 + spec.seed, 1.7) * 0.9
      const b = Math.sin((p.y + wob) * 0.55 + spec.seed)
      o.lerp(b > 0.2 ? sand : slate, smoothstep(0.3, 0.85, Math.abs(b)) * 0.6 * smoothstep(0.03, 0.12, t))
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
  const rootC = col('#4a3628'), vineC = col('#46682c'), vineTip = col('#5f8a34')
  const nRoots = Math.round(10 + R * 0.9)
  for (let i = 0; i < nRoots; i++) {
    const ang = r() * Math.PI * 2
    const rr = R * rimAt(ang) * (0.86 + r() * 0.08)
    let x = Math.cos(ang) * rr, z = Math.sin(ang) * rr, y = -0.25 - r() * 0.8 * sc
    const vine = r() < 0.45
    const len = (vine ? 3 + r() * 5 : 1.6 + r() * 4) * sc
    const segs = 3
    let rad0 = (vine ? 0.12 : 0.2) * sc
    for (let k = 0; k < segs; k++) {
      const out = (r() - 0.3) * 0.5 * sc
      const nx = x + Math.cos(ang) * out + (r() - 0.5) * 0.4 * sc, nz = z + Math.sin(ang) * out + (r() - 0.5) * 0.4 * sc
      const ny = y - len / segs
      const rad1 = rad0 * 0.62
      extra.push(solidColor(branch(x, y, z, nx, ny, nz, rad0, rad1, 4), vine ? vineC : rootC))
      x = nx; y = ny; z = nz; rad0 = rad1
    }
    if (vine) {
      const tip = blob(0.45 * sc, 0, 200 + i, 0.3)
      tip.scale(1, 1.5, 1); tip.translate(x, y + 0.2 * sc, z)
      extra.push(solidColor(tip, vineTip))
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
export function buildCity(list: Building[], { lowPoly, palette }: BuildOpts) {
  const parts: THREE.BufferGeometry[] = []
  const a = col(palette.cityA), b = col(palette.cityB), top = col(palette.cityTop)
  for (const bd of list) {
    const box = new THREE.BoxGeometry(bd.w, bd.h, bd.d)
    box.translate(bd.x, bd.h / 2 + terrainHeight(bd.x, bd.z), bd.z)
    // UVs scaled to world size → window grid of consistent density
    const uv = box.getAttribute('uv'), nor = box.getAttribute('normal')
    for (let i = 0; i < uv.count; i++) {
      const sideX = Math.abs(nor.getX(i)) > 0.5
      const sideY = Math.abs(nor.getY(i)) > 0.5
      const w = sideX ? bd.d : bd.w
      uv.setXY(i, sideY ? 0 : (uv.getX(i) * w / 3.2 + bd.tone * 13.7) / 4, sideY ? 0 : (uv.getY(i) * bd.h / 3.4 + Math.floor(bd.tone * 97)) / 4)
    }
    const base = palette.cityTints ? C.set(palette.cityTints[Math.floor(bd.tone * palette.cityTints.length) % palette.cityTints.length]) : C.copy(a).lerp(b, bd.tone)
    const terr = terrainHeight(bd.x, bd.z)
    setColors(box, (p, n, o) => {
      o.copy(base).multiplyScalar(0.7 + clamp((p.y - terr) / 120) * 0.4)
      if (n.y > 0.5) o.copy(top)
    })
    parts.push(normalizeAttrs(box, true))
    if (bd.kind === 1) {
      // setback tower + spire
      const t2 = new THREE.BoxGeometry(bd.w * 0.62, bd.h * 0.22, bd.d * 0.62)
      t2.translate(bd.x, terr + bd.h * 1.11, bd.z)
      setColors(t2, (_p, _n, o) => o.copy(base).multiplyScalar(1.05))
      parts.push(normalizeAttrs(zeroUv(t2), true))
      const sp = new THREE.ConeGeometry(bd.w * 0.12, bd.h > 90 ? bd.h * 0.3 : bd.h * 0.08, 6)
      sp.translate(bd.x, terr + bd.h * 1.22 + bd.h * 0.15, bd.z)
      setColors(sp, (_p, _n, o) => o.copy(top))
      parts.push(normalizeAttrs(zeroUv(sp), true))
    } else if (bd.kind === 2) {
      const dome = new THREE.SphereGeometry(Math.min(bd.w, bd.d) * 0.48, lowPoly ? 6 : 14, lowPoly ? 4 : 8, 0, Math.PI * 2, 0, Math.PI / 2)
      dome.translate(bd.x, terr + bd.h, bd.z)
      setColors(dome, (_p, _n, o) => o.copy(top))
      parts.push(normalizeAttrs(zeroUv(dome), true))
    }
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
    // lights come in runs along a floor (apartments / offices), most floors dark
    const floorBusy = r() < 0.35 ? 0.24 : 0.03
    let on = false
    for (let x = 0; x < n; x++) {
      if (r() < 0.3) on = r() < floorBusy
      const warm = r()
      ctx.fillStyle = on ? (warm > 0.85 ? `rgb(${190 + warm * 30},${215},${235})` : `rgb(${225 + warm * 30},${175 + warm * 45},${110 + warm * 60})`) : '#0b0d12'
      ctx.fillRect(x * c + 3, y * c + 4, c - 6, c - 7)
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
  ctx.fillStyle = '#f4f3f0'
  ctx.fillRect(0, 0, s, s)
  const r = rng(11)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 150 + r() * 40
    ctx.fillStyle = `rgb(${v - 25},${v - 5},${v + 25})`
    ctx.fillRect(x * c + 3, y * c + 3, c - 6, c - 6)
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

export function buildLamp({ lowPoly }: BuildOpts) {
  const pole = new THREE.CylinderGeometry(0.06, 0.09, 4.2, lowPoly ? 5 : 8)
  pole.translate(0, 2.1, 0)
  const arm = new THREE.BoxGeometry(0.9, 0.07, 0.07)
  arm.translate(-0.42, 4.15, 0)
  solidColor(pole, '#2c3138'); solidColor(arm, '#2c3138')
  const g = mergeGeometries([pole, arm].map((p) => normalizeAttrs(p)))!
  return g
}

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
