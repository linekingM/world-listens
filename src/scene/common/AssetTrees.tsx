import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { ROAD_WIDTH, lampSpots, roadX, terrainHeight, type TreeSpot } from '../../world/layout'
import { rng } from '../../lib/random'
import { addLeafGlow, addWind , addCanopyNormals } from './materialFx'

/**
 * Hand-modelled CC0 trees (Quaternius "Stylized Nature MegaKit", see public/models/LICENSE.txt),
 * instanced for the avenue and near meadows. Leaves are alpha-tested cards with our wind + backlight shaders.
 */
export const BROADLEAF = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5']
export const PINES = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5']
const url = (n: string) => `/models/${n}.glb`
// (Bush_Common_Flowers is dropped: its big flower cards turn the whole shrub into a saturated red blob at this scale)
export const FLORA = ['Bush_Common', 'Flower_3_Group', 'Flower_4_Group']
/** false with ?assets=0: everything falls back to the procedural trees */
export const ASSETS_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('assets') !== '0'
if (ASSETS_ON) for (const n of [...BROADLEAF, ...PINES, ...FLORA]) useGLTF.preload(url(n))

const matCache = new Map<string, THREE.Material>()
function treeMaterial(src: THREE.MeshStandardMaterial) {
  const key = (src.name || src.uuid) + '|' + (src.map?.source.uuid ?? '')
  let m = matCache.get(key)
  if (m) return m
  const leaves = !/bark/i.test(src.name) // every alpha-cut card (leaves, flowers) is double-sided foliage
  const mm = new THREE.MeshStandardMaterial({
    name: src.name, map: src.map, alphaTest: leaves ? (/flower/i.test(src.name) ? 0.3 : 0.42) : 0, transparent: false,
    side: leaves ? THREE.DoubleSide : THREE.FrontSide, roughness: leaves ? 0.8 : 0.95, metalness: 0,
    normalMap: leaves ? null : src.normalMap,
  })
  if (mm.map) mm.map.colorSpace = THREE.SRGBColorSpace
  // the kit's TwistedTree/bush leaves are a red mask recoloured in its own shader: keep only the alpha, colour it ourselves
  if (/twisted/i.test(src.name) && src.map?.image) {
    const img = src.map.image as CanvasImageSource & { width: number; height: number }
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
    const cx = cv.getContext('2d')!
    cx.drawImage(img, 0, 0)
    const d = cx.getImageData(0, 0, cv.width, cv.height)
    for (let i = 0; i < d.data.length; i += 4) { const r = d.data[i]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 150 + (r >> 2) }
    cx.putImageData(d, 0, 0)
    const t = new THREE.CanvasTexture(cv); t.flipY = src.map.flipY; t.colorSpace = THREE.SRGBColorSpace
    mm.map = t; mm.color.set('#8fae62')
  }
  addWind(mm, leaves ? 0.09 : 0.05, 6)
  if (leaves) { if (/leaf|leaves/i.test(src.name)) addCanopyNormals(mm); addLeafGlow(mm, /flower/i.test(src.name) ? 0.5 : 0.9) }
  matCache.set(key, mm)
  return mm
}

interface Part { geo: THREE.BufferGeometry; mat: THREE.Material; leaves: boolean }
export type AssetModel = ReturnType<typeof useAssetModel>
export function useAssetModel(name: string) {
  const gltf = useGLTF(url(name))
  return useMemo(() => {
    const parts: Part[] = []
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const g = mesh.geometry.clone()
      // meshopt-quantized attributes are normalized int16/int8: dequantize to float BEFORE transforming,
      // otherwise applyMatrix4 writes back into [-1,1] and clamps the tree into a box
      for (const name of ['position', 'normal']) {
        const a = g.getAttribute(name) as THREE.BufferAttribute | undefined
        if (!a) continue
        const f = new Float32Array(a.count * 3)
        for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i) }
        g.setAttribute(name, new THREE.BufferAttribute(f, 3))
      }
      g.applyMatrix4(mesh.matrixWorld)
      const src = mesh.material as THREE.MeshStandardMaterial
      if (/leaf|leaves/i.test(src.name)) {
        // spherical normals from the crown centre (75% blend) -> soft unified volume shading
        g.computeBoundingBox()
        const ctr = g.boundingBox!.getCenter(new THREE.Vector3())
        const half = g.boundingBox!.getSize(new THREE.Vector3()).multiplyScalar(0.5)
        const pos = g.getAttribute('position'), nrm = g.getAttribute('normal')
        const d = new THREE.Vector3(), n = new THREE.Vector3()
        for (let i = 0; i < pos.count; i++) {
          d.set((pos.getX(i) - ctr.x) / half.x, (pos.getY(i) - ctr.y + half.y * 0.25) / half.y, (pos.getZ(i) - ctr.z) / half.z).normalize()
          n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).lerp(d, 0.75).normalize()
          nrm.setXYZ(i, n.x, n.y, n.z)
        }
      }
      parts.push({ geo: g, mat: treeMaterial(src), leaves: /leaf|leaves/i.test(src.name) })
    })
    const box = new THREE.Box3()
    for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox!) }
    return { parts, height: box.max.y - box.min.y, minY: box.min.y }
  }, [gltf])
}

const TINT_WARM = new THREE.Color('#fff4d8'), TINT_COOL = new THREE.Color('#e4f4e8')
// the kit's leaf texture is a deep forest green; lift it towards the fresh spring palette of the meadow
// muted olive/sage so the crowns sit in the soft clay world (no chartreuse); pines lifted out of near-black
const LEAF_A = new THREE.Color(1.12, 1.1, 0.86), LEAF_B = new THREE.Color(1.26, 1.13, 0.78), PINE = new THREE.Color(1.25, 1.3, 1.1)
// soft tinted contact pocket under each tree trunk (grounds the trees; olive, not black)
const pocketTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()
const pocketGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const pocketMat = new THREE.MeshBasicMaterial({ map: pocketTex, color: '#2c3a24', transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true })
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler()

function ModelInstances({ name, spots, targetH, pine, shadows = true, uvShift, shrink = true }: { name: string; spots: TreeSpot[]; targetH: number; pine?: boolean; shadows?: boolean; uvShift?: [number, number]; shrink?: boolean }) {
  const base = useAssetModel(name)
  // recolour flower cards by sliding their UVs to another cell of the flower atlas (lavender / peach / ...)
  const model = useMemo(() => {
    if (!uvShift) return base
    const parts = base.parts.map((p) => {
      if (!/flower/i.test(p.mat.name)) return p
      const g = p.geo.clone(), uv = g.getAttribute('uv')
      const f = new Float32Array(uv.count * 2)
      for (let i = 0; i < uv.count; i++) { f[i * 2] = uv.getX(i) + uvShift[0]; f[i * 2 + 1] = uv.getY(i) + uvShift[1] }
      g.setAttribute('uv', new THREE.BufferAttribute(f, 2))
      return { ...p, geo: g }
    })
    return { ...base, parts }
  }, [base, uvShift])
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  const pocket = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const c = new THREE.Color()
    refs.current.forEach((m, pi) => {
      if (!m) return
      const leaves = model.parts[pi]?.leaves
      spots.forEach((t, i) => {
        // no foreground giants walling off the path: trees right next to the camera get scaled down
        const cd = Math.hypot(t.x - 8, t.z - 38)
        const k = (t.s * targetH * (shrink && cd < 30 ? 0.62 + (cd / 30) * 0.38 : 1)) / model.height
        // a few degrees of lean, never two trees alike
        _e.set(Math.sin(t.rot * 3.1) * 0.06, t.rot, Math.cos(t.rot * 2.3) * 0.06)
        _q.setFromEuler(_e)
        _s.set(k * (0.92 + (t.tint * 3.7 % 1) * 0.16), k, k * (0.92 + (t.tint * 5.3 % 1) * 0.16))
        _p.set(t.x, t.y - 0.15 - model.minY * k, t.z)
        m.setMatrixAt(i, _m.compose(_p, _q, _s))
        const v = (t.tint * 7.31) % 1
        if (leaves && pine) c.copy(PINE).multiplyScalar(0.9 + t.tint * 0.2)
        else if (leaves) c.copy(LEAF_A).lerp(LEAF_B, v * v).multiplyScalar(0.9 + t.tint * 0.2)
        else c.copy(TINT_COOL).lerp(TINT_WARM, v).multiplyScalar(0.9 + t.tint * 0.18)
        m.setColorAt(i, c)
      })
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    })
    const pm = pocket.current
    if (pm) {
      spots.forEach((t, i) => {
        const r = t.s * targetH * 0.42
        _q.identity(); _s.set(r, 1, r); _p.set(t.x, t.y + 0.04, t.z)
        pm.setMatrixAt(i, _m.compose(_p, _q, _s))
      })
      pm.instanceMatrix.needsUpdate = true
      pm.computeBoundingSphere()
    }
  }, [spots, model, targetH])
  if (!spots.length) return null
  return (
    <group>
      {model.parts.map((p, i) => (
        <instancedMesh key={i} ref={(r) => { refs.current[i] = r }} args={[p.geo, p.mat, spots.length]} castShadow={shadows} receiveShadow frustumCulled={false} raycast={() => null} />
      ))}
      {shadows && <instancedMesh ref={pocket} args={[pocketGeo, pocketMat, spots.length]} frustumCulled={false} raycast={() => null} renderOrder={1} />}
    </group>
  )
}

/** Distribute spots over the models (species by kind, model by tint) and render them instanced. */
export function AssetTrees({ spots }: { spots: TreeSpot[] }) {
  ;(window as unknown as { __assetTrees: number }).__assetTrees = spots.length
  const groups = useMemo(() => {
    const out: { name: string; spots: TreeSpot[]; h: number; pine?: boolean }[] = []
    const add = (names: string[], list: TreeSpot[], h: number, pine?: boolean) => names.forEach((n, i) => out.push({ name: n, spots: list.filter((s) => Math.floor(((s.tint * 13.7) % 1) * names.length) === i), h, pine }))
    // ~1 pine per 4 broadleaf near the path: the rest of the pine spots become broadleaf crowns
    // pines only in the mid-ground (no dark cropped firs in the corners)
    const isPine = (s: TreeSpot) => s.kind === 1 && ((s.tint * 29.1) % 1) < 0.4 && Math.hypot(s.x - 8, s.z - 38) > 45
    add(BROADLEAF, spots.filter((s) => !isPine(s)), 7.6)
    add(PINES, spots.filter(isPine), 8, true)
    return out
  }, [spots])
  return <>{groups.map((g) => <ModelInstances key={g.name} name={g.name} spots={g.spots} targetH={g.h} pine={g.pine} />)}</>
}

/** A single (non-instanced) asset tree for editable objects and island groves; base at y=0, height = targetH. */
export function AssetTreeVisual({ name, targetH, override, shadows = true, tint = 0.5, pine }: { name: string; targetH: number; override?: THREE.Material; shadows?: boolean; tint?: number; pine?: boolean }) {
  const model = useAssetModel(name)
  const k = targetH / model.height
  // per-object colour comes from cloned materials sharing the cached shader program
  const mats = useMemo(() => model.parts.map((p) => {
    if (override) return override
    const m = (p.mat as THREE.MeshStandardMaterial).clone()
    m.onBeforeCompile = p.mat.onBeforeCompile
    m.customProgramCacheKey = p.mat.customProgramCacheKey
    if (p.leaves && pine) m.color.copy(PINE)
    else if (p.leaves) m.color.copy(LEAF_A).lerp(LEAF_B, tint)
    return m
  }), [model, override, tint, pine])
  return (
    <group scale={k} position-y={-model.minY * k - 0.1}>
      {model.parts.map((p, i) => <mesh key={i} geometry={p.geo} material={mats[i]} castShadow={shadows && !override} receiveShadow={!override} raycast={override ? () => null : undefined} />)}
    </group>
  )
}

// Flower_3's cards sit on the pink centre cell of the atlas (v from the top): shift to lavender / peach
const FLORA_SETS: { name: string; h: number; uv?: [number, number] }[] = [
  { name: 'Bush_Common', h: 1.8 },
  { name: 'Flower_3_Group', h: 1.5, uv: [0.25, -0.3] }, // lavender
  { name: 'Flower_3_Group', h: 1.35, uv: [-0.28, -0.31] }, // peach
  { name: 'Flower_3_Group', h: 1.3 }, // pink
  { name: 'Flower_4_Group', h: 1.5 }, // yellow meadow
  { name: 'Flower_3_Group', h: 1.4, uv: [0.25, -0.3] }, // lavender (second drift)
]

/** Bushes, flowering shrubs and wildflower clumps in loose drifts along both path edges (near stretch only). */
export function PathFlora() {
  const groups = useMemo(() => {
    const r = rng(4242)
    const lamps = lampSpots()
    const by: TreeSpot[][] = FLORA_SETS.map(() => [])
    for (let z = 30; z > -70; z -= 1.2 + r() * 2.0) {
      if (r() < 0.22) { z -= 3 + r() * 4; continue } // gaps so the grass stays the larger shape
      for (const side of [-1, 1]) {
        if (r() < 0.2) continue
        // flowers spill right up to the flagstone edge (where the meadow grass thins), bushes sit further out
        const edge = r() < 0.6
        const off = edge ? ROAD_WIDTH / 2 + 0.5 + r() * 1.3 : ROAD_WIDTH / 2 + 2.2 + r() * 2.2
        const x = roadX(z) + side * off
        if (lamps.some((l) => Math.abs(l.z - z) < 2.2 && l.side === side)) continue
        // flowers hug the edge in clumps of 1-3, bushes sit a little further out
        // edge flowers: mostly lavender, some yellow meadow clumps, a little peach / pink
        const q = r()
        const pick = edge ? (q < 0.45 ? 1 : q < 0.7 ? 4 : q < 0.85 ? 2 : q < 0.95 ? 3 : 5) : 0
        const n = pick >= 1 ? 1 + Math.floor(r() * 3) : 1
        for (let j = 0; j < n; j++) {
          const xx = x + side * j * 0.7, zz = z + (r() - 0.5) * 1.4
          by[pick].push({ x: xx, z: zz, y: terrainHeight(xx, zz) + 0.12, s: pick < 1 ? 0.7 + r() * 0.6 : 0.8 + r() * 0.5, kind: 0, tint: r(), rot: r() * 6.28 })
        }
      }
    }
    return by
  }, [])
  return (
    <>
      {FLORA_SETS.map((f, i) => <ModelInstances key={i} name={f.name} spots={groups[i]} targetH={f.h} shadows={i === 0} uvShift={f.uv} shrink={i === 0} />)}
    </>
  )
}
