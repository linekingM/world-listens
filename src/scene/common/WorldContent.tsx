import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEnv, useStyleDef } from './EnvContext'
import {
  buildCity, buildHouse, buildIsland, buildLamp, buildMountains, buildRoad, buildTerrain, buildTree, windowTexture, facadeTexture,
} from '../../world/geometry'
import { ISLANDS, cityBuildings, lampSpots, terrainHeight, treeSpots, type IslandSpec } from '../../world/layout'
import { Waterfall } from './Waterfall'
import { smoothstep } from '../../lib/random'

const VARIANTS = 3
const TINT_WARM = new THREE.Color('#fff0c8'), TINT_COOL = new THREE.Color('#d6f0e6')
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler()

function TreeInstances({ geometry, material, spots }: { geometry: THREE.BufferGeometry; material: THREE.Material; spots: ReturnType<typeof treeSpots> }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = ref.current
    const c = new THREE.Color()
    spots.forEach((t, i) => {
      _e.set(0, t.rot, 0)
      _q.setFromEuler(_e)
      _s.setScalar(t.s)
      _p.set(t.x, t.y - 0.1, t.z)
      m.setMatrixAt(i, _m.compose(_p, _q, _s))
      c.copy(TINT_COOL).lerp(TINT_WARM, (t.tint * 7.31) % 1).multiplyScalar(0.86 + t.tint * 0.26)
      m.setColorAt(i, c)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [spots])
  return <instancedMesh ref={ref} args={[geometry, material, spots.length]} castShadow receiveShadow frustumCulled={false} />
}

function islandTopY(spec: IslandSpec, x: number, z: number) {
  const r2 = (x * x + z * z) / Math.pow(spec.radius * 0.85, 2)
  return spec.radius * 0.16 * Math.sqrt(Math.max(0, 1 - r2)) - 0.15
}

function FloatingIsland({ spec, index }: { spec: IslandSpec; index: number }) {
  const style = useStyleDef()
  const opts = useMemo(() => ({ lowPoly: style.lowPoly, palette: style.palette }), [style])
  const group = useRef<THREE.Group>(null!)
  const geo = useMemo(() => buildIsland(spec, opts), [spec, opts])
  const houseGeos = useMemo(() => spec.houses.map((h, i) => buildHouse(h.kind, index + i, opts)), [spec, opts, index])
  const treeGeo = useMemo(() => buildTree(0, opts, index), [opts, index])
  const rock = useMemo(() => style.makeMaterial('rock'), [style])
  const bld = useMemo(() => style.makeMaterial('building'), [style])
  const fol = useMemo(() => style.makeMaterial('foliage'), [style])
  useFrame((s) => {
    const t = s.clock.elapsedTime
    group.current.position.y = spec.pos[1] + Math.sin(t * 0.35 + index * 2) * 0.8
    group.current.rotation.y = Math.sin(t * 0.08 + index) * 0.04
  })
  // waterfall spills toward the default camera
  const wf = useMemo(() => {
    const dir = new THREE.Vector2(3 - spec.pos[0], 26 - spec.pos[2]).normalize()
    return { x: dir.x * spec.radius * 0.8, z: dir.y * spec.radius * 0.8, rot: Math.atan2(dir.x, dir.y) }
  }, [spec])
  return (
    <group ref={group} position={spec.pos}>
      <mesh geometry={geo} material={rock} castShadow receiveShadow />
      {spec.houses.map((h, i) => (
        <mesh key={i} geometry={houseGeos[i]} material={bld} position={[h.x, islandTopY(spec, h.x, h.z), h.z]} rotation-y={h.rot} scale={h.s} castShadow receiveShadow />
      ))}
      {spec.trees.map((t, i) => (
        <mesh key={i} geometry={treeGeo} material={fol} position={[t.x, islandTopY(spec, t.x, t.z) - 0.1, t.z]} scale={t.s * 0.85} rotation-y={i * 1.7} castShadow receiveShadow />
      ))}
      {spec.waterfall && <Waterfall position={[wf.x, 0.2, wf.z]} rotationY={wf.rot} height={30} />}
    </group>
  )
}

function Lamps() {
  const style = useStyleDef()
  const env = useEnv()
  const spots = useMemo(() => lampSpots(), [])
  const opts = useMemo(() => ({ lowPoly: style.lowPoly, palette: style.palette }), [style])
  const pole = useMemo(() => buildLamp(opts), [opts])
  const poleMat = useMemo(() => style.makeMaterial('prop'), [style])
  const bulbMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }), [])
  const poolMat = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128
    const g = cv.getContext('2d')!
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd.addColorStop(0, 'rgba(255,214,150,0.9)'); grd.addColorStop(0.4, 'rgba(255,190,120,0.35)'); grd.addColorStop(1, 'rgba(255,180,110,0)')
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
  }, [])
  useFrame(() => {
    const on = smoothstep(2, -6, env.sun.elevation)
    bulbMat.color.setRGB(1, 0.85, 0.6).multiplyScalar(0.25 + on * 5)
    poolMat.opacity = on * 0.8
    poolMat.visible = on > 0.01
  })
  return (
    <group>
      {spots.map((l, i) => {
        const y = Math.max(terrainHeight(l.x, l.z), 0) + 0.1
        const ang = l.side > 0 ? 0 : Math.PI
        return (
          <group key={i} position={[l.x, y, l.z]} rotation-y={ang}>
            <mesh geometry={pole} material={poleMat} castShadow />
            <mesh position={[-0.82, 4.05, 0]} material={bulbMat}><sphereGeometry args={[0.13, 8, 6]} /></mesh>
            <mesh position={[-1.8, 0.1, 0]} rotation-x={-Math.PI / 2} material={poolMat}><planeGeometry args={[7, 7]} /></mesh>
          </group>
        )
      })}
    </group>
  )
}

/** All the static scenery, rendered with the active style's materials. */
export function WorldContent() {
  const style = useStyleDef()
  const env = useEnv()
  const opts = useMemo(() => ({ lowPoly: style.lowPoly, palette: style.palette }), [style])
  const terrain = useMemo(() => buildTerrain(opts), [opts])
  const road = useMemo(() => buildRoad(opts), [opts])
  const city = useMemo(() => buildCity(cityBuildings(), opts), [opts])
  const mountains = useMemo(() => buildMountains(opts), [opts])
  const spots = useMemo(() => treeSpots(), [])
  const trees = useMemo(() => {
    const groups: { geo: THREE.BufferGeometry; spots: typeof spots }[] = []
    for (const kind of [0, 1, 2] as const) for (let v = 0; v < VARIANTS; v++) {
      const sub = spots.filter((s) => s.kind === kind && Math.floor(s.tint * VARIANTS) === v)
      if (sub.length) groups.push({ geo: buildTree(kind, opts, v), spots: sub })
    }
    return groups
  }, [opts, spots])

  const mats = useMemo(() => ({
    terrain: style.makeMaterial('terrain'),
    road: style.makeMaterial('road'),
    foliage: style.makeMaterial('foliage'),
    city: style.makeMaterial('city'),
    mountain: style.makeMaterial('mountain'),
  }), [style])

  const windows = useMemo(() => windowTexture(), [])
  const facade = useMemo(() => (style.lowPoly ? null : facadeTexture()), [style])
  useEffect(() => {
    const m = mats.city as THREE.MeshStandardMaterial
    if ('emissiveMap' in m) { m.emissiveMap = windows; m.emissive = new THREE.Color('#ffc98a'); if (facade) m.map = facade; m.needsUpdate = true }
  }, [mats, windows, facade])
  useFrame(() => {
    const m = mats.city as THREE.MeshStandardMaterial
    if ('emissiveIntensity' in m) m.emissiveIntensity = smoothstep(4, -5, env.sun.elevation) * 1.4
  })

  useEffect(() => () => {
    for (const g of [terrain, road.road, road.markings, road.curbs, city, mountains, ...trees.map((t) => t.geo)]) g.dispose()
  }, [terrain, road, city, mountains, trees])

  return (
    <group>
      <mesh geometry={terrain} material={mats.terrain} receiveShadow />
      <mesh geometry={road.road} material={mats.road} receiveShadow />
      <mesh geometry={road.markings} material={mats.road} receiveShadow />
      <mesh geometry={road.curbs} material={mats.road} receiveShadow castShadow />
      <mesh geometry={city} material={mats.city} castShadow receiveShadow />
      <mesh geometry={mountains} material={mats.mountain} />
      {trees.map((t, i) => <TreeInstances key={i} geometry={t.geo} material={mats.foliage} spots={t.spots} />)}
      {ISLANDS.map((s, i) => <FloatingIsland key={i} spec={s} index={i} />)}
      <Lamps />
    </group>
  )
}
