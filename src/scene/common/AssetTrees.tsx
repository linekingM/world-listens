import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import type { TreeSpot } from '../../world/layout'
import { addLeafGlow, addWind , addCanopyNormals } from './materialFx'

/**
 * Hand-modelled CC0 trees (Quaternius "Stylized Nature MegaKit", see public/models/LICENSE.txt),
 * instanced for the avenue and near meadows. Leaves are alpha-tested cards with our wind + backlight shaders.
 */
export const BROADLEAF = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5']
export const PINES = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5']
const url = (n: string) => `/models/${n}.glb`
for (const n of [...BROADLEAF, ...PINES]) useGLTF.preload(url(n))

const matCache = new Map<string, THREE.Material>()
function treeMaterial(src: THREE.MeshStandardMaterial) {
  const key = src.name || src.uuid
  let m = matCache.get(key)
  if (m) return m
  const leaves = /leaf|leaves/i.test(src.name)
  const mm = new THREE.MeshStandardMaterial({
    name: src.name, map: src.map, alphaTest: leaves ? 0.42 : 0, transparent: false,
    side: leaves ? THREE.DoubleSide : THREE.FrontSide, roughness: leaves ? 0.8 : 0.95, metalness: 0,
    normalMap: leaves ? null : src.normalMap,
  })
  if (mm.map) mm.map.colorSpace = THREE.SRGBColorSpace
  addWind(mm, leaves ? 0.09 : 0.05, 6)
  if (leaves) { addCanopyNormals(mm); addLeafGlow(mm, 0.9) }
  matCache.set(key, mm)
  return mm
}

interface Part { geo: THREE.BufferGeometry; mat: THREE.Material; leaves: boolean }
function useTreeModel(name: string) {
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
const LEAF_A = new THREE.Color(1.3, 1.42, 0.86), LEAF_B = new THREE.Color(1.5, 1.38, 0.72)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler()

function ModelInstances({ name, spots, targetH }: { name: string; spots: TreeSpot[]; targetH: number }) {
  const model = useTreeModel(name)
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  useLayoutEffect(() => {
    const c = new THREE.Color()
    refs.current.forEach((m, pi) => {
      if (!m) return
      const leaves = model.parts[pi]?.leaves
      spots.forEach((t, i) => {
        const k = (t.s * targetH) / model.height
        // a few degrees of lean, never two trees alike
        _e.set(Math.sin(t.rot * 3.1) * 0.06, t.rot, Math.cos(t.rot * 2.3) * 0.06)
        _q.setFromEuler(_e)
        _s.set(k * (0.92 + (t.tint * 3.7 % 1) * 0.16), k, k * (0.92 + (t.tint * 5.3 % 1) * 0.16))
        _p.set(t.x, t.y - 0.15 - model.minY * k, t.z)
        m.setMatrixAt(i, _m.compose(_p, _q, _s))
        const v = (t.tint * 7.31) % 1
        if (leaves) c.copy(LEAF_A).lerp(LEAF_B, v * v).multiplyScalar(0.9 + t.tint * 0.2)
        else c.copy(TINT_COOL).lerp(TINT_WARM, v).multiplyScalar(0.9 + t.tint * 0.18)
        m.setColorAt(i, c)
      })
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    })
  }, [spots, model, targetH])
  if (!spots.length) return null
  return (
    <group>
      {model.parts.map((p, i) => (
        <instancedMesh key={i} ref={(r) => { refs.current[i] = r }} args={[p.geo, p.mat, spots.length]} castShadow receiveShadow frustumCulled={false} raycast={() => null} />
      ))}
    </group>
  )
}

/** Distribute spots over the models (species by kind, model by tint) and render them instanced. */
export function AssetTrees({ spots }: { spots: TreeSpot[] }) {
  ;(window as unknown as { __assetTrees: number }).__assetTrees = spots.length
  const groups = useMemo(() => {
    const out: { name: string; spots: TreeSpot[]; h: number }[] = []
    const add = (names: string[], list: TreeSpot[], h: number) => names.forEach((n, i) => out.push({ name: n, spots: list.filter((s) => Math.floor(((s.tint * 13.7) % 1) * names.length) === i), h }))
    add(BROADLEAF, spots.filter((s) => s.kind !== 1), 7.6)
    add(PINES, spots.filter((s) => s.kind === 1), 9)
    return out
  }, [spots])
  return <>{groups.map((g) => <ModelInstances key={g.name} name={g.name} spots={g.spots} targetH={g.h} />)}</>
}
