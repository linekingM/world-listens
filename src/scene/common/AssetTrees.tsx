import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import type { TreeSpot } from '../../world/layout'
import { addLeafGlow, addWind } from './materialFx'

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
  if (leaves) addLeafGlow(mm, 0.9)
  matCache.set(key, mm)
  return mm
}

interface Part { geo: THREE.BufferGeometry; mat: THREE.Material }
function useTreeModel(name: string) {
  const gltf = useGLTF(url(name))
  return useMemo(() => {
    const parts: Part[] = []
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const g = mesh.geometry.clone()
      g.applyMatrix4(mesh.matrixWorld)
      parts.push({ geo: g, mat: treeMaterial(mesh.material as THREE.MeshStandardMaterial) })
    })
    const box = new THREE.Box3()
    for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox!) }
    return { parts, height: box.max.y - box.min.y, minY: box.min.y }
  }, [gltf])
}

const TINT_WARM = new THREE.Color('#fff4d8'), TINT_COOL = new THREE.Color('#e4f4e8')
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler()

function ModelInstances({ name, spots, targetH }: { name: string; spots: TreeSpot[]; targetH: number }) {
  const model = useTreeModel(name)
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  useLayoutEffect(() => {
    const c = new THREE.Color()
    for (const m of refs.current) {
      if (!m) continue
      spots.forEach((t, i) => {
        const k = (t.s * targetH) / model.height
        // a few degrees of lean, never two trees alike
        _e.set(Math.sin(t.rot * 3.1) * 0.06, t.rot, Math.cos(t.rot * 2.3) * 0.06)
        _q.setFromEuler(_e)
        _s.set(k * (0.92 + (t.tint * 3.7 % 1) * 0.16), k, k * (0.92 + (t.tint * 5.3 % 1) * 0.16))
        _p.set(t.x, t.y - 0.15 - model.minY * k, t.z)
        m.setMatrixAt(i, _m.compose(_p, _q, _s))
        c.copy(TINT_COOL).lerp(TINT_WARM, (t.tint * 7.31) % 1).multiplyScalar(0.9 + t.tint * 0.18)
        m.setColorAt(i, c)
      })
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    }
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
  const groups = useMemo(() => {
    const out: { name: string; spots: TreeSpot[]; h: number }[] = []
    const add = (names: string[], list: TreeSpot[], h: number) => names.forEach((n, i) => out.push({ name: n, spots: list.filter((s) => Math.floor(((s.tint * 13.7) % 1) * names.length) === i), h }))
    add(BROADLEAF, spots.filter((s) => s.kind !== 1), 7.6)
    add(PINES, spots.filter((s) => s.kind === 1), 9)
    return out
  }, [spots])
  return <>{groups.map((g) => <ModelInstances key={g.name} name={g.name} spots={g.spots} targetH={g.h} />)}</>
}
