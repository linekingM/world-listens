import { addFlagstones } from './materialFx'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { ASSETS_ON, AssetTrees, PathFlora } from './AssetTrees'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEnv, useStyleDef } from './EnvContext'
import {
  buildCity, buildLamp, lanternGlassGeo, buildMountains, buildRoad, buildTerrain, buildTree, windowTexture, facadeTexture,
} from '../../world/geometry'
import { cityBuildings, lampSpots, roadX, terrainHeight, treeSpots } from '../../world/layout'
import { getMaterial } from './materials'
import { smoothstep } from '../../lib/random'

const VARIANTS = 3
/** weighted species mix: umbrella trees and birches are accents, not the norm */
const variantOf = (kind: number, t: number) => kind === 0 ? (t < 0.48 ? 0 : t < 0.94 ? 1 : 2) : kind === 2 ? (t < 0.4 ? 0 : t < 0.7 ? 1 : 2) : Math.floor(t * 3)
const TINT_WARM = new THREE.Color('#fff0c8'), TINT_COOL = new THREE.Color('#d6f0e6')
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler()

function TreeInstances({ geometry, material, spots }: { geometry: THREE.BufferGeometry; material: THREE.Material; spots: ReturnType<typeof treeSpots> }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = ref.current
    const c = new THREE.Color()
    spots.forEach((t, i) => {
      _e.set(Math.sin(t.rot * 3.1) * 0.05, t.rot, Math.cos(t.rot * 2.3) * 0.05)
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

function Lamps() {
  const style = useStyleDef()
  const env = useEnv()
  const spots = useMemo(() => lampSpots(), [])
  const opts = useMemo(() => ({ lowPoly: style.lowPoly, palette: style.palette }), [style])
  const pole = useMemo(() => buildLamp(opts), [opts])
  const glassGeo = useMemo(() => lanternGlassGeo(), [])
  const poleMat = getMaterial(style, 'prop')
  const bulbMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }), [])
  const poolMat = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128
    const g = cv.getContext('2d')!
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    for (let k = 0; k <= 12; k++) { const t = k / 12; grd.addColorStop(t, `rgba(255,${205 - t * 25},${145 - t * 30},${(0.5 * Math.exp(-t * t * 5.5) * (1 - t)).toFixed(3)})`) }
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
  }, [])
  const haloMat = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64
    const g = cv.getContext('2d')!
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grd.addColorStop(0, 'rgba(255,220,160,0.9)'); grd.addColorStop(0.3, 'rgba(255,200,140,0.3)'); grd.addColorStop(1, 'rgba(255,190,120,0)')
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
    return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true, toneMapped: false })
  }, [])
  const halos = useRef<THREE.Group>(null!)
  useFrame(() => {
    const on = smoothstep(2, -6, env.sun.elevation)
    bulbMat.color.setRGB(1, 0.85, 0.6).multiplyScalar(0.25 + on * 2.6)
    poolMat.opacity = on * 0.75
    poolMat.visible = on > 0.01
    // in mist the lamps bloom into soft lantern halos
    const m = env.weather.mist
    haloMat.opacity = on * (0.2 + m * 0.4)
    halos.current.visible = haloMat.opacity > 0.01
    const sc = 2 + m * 1.6
    halos.current.children.forEach((c) => c.scale.set(sc, sc, 1))
  })
  return (
    <group>
      {spots.map((l, i) => {
        const y = Math.max(terrainHeight(l.x, l.z), 0) + 0.1
        const ang = l.side > 0 ? 0 : Math.PI
        return (
          <group key={i} position={[l.x, y, l.z]} rotation-y={ang}>
            <mesh geometry={pole} material={poleMat} castShadow />
            <mesh position={[-0.82, 4.03, 0]} material={bulbMat} geometry={glassGeo} />
            <mesh position={[-1.8, 0.1, 0]} rotation-x={-Math.PI / 2} material={poolMat}><circleGeometry args={[5.5, 28]} /></mesh>
          </group>
        )
      })}
      <group ref={halos}>
        {spots.map((l, i) => {
          const y = Math.max(terrainHeight(l.x, l.z), 0) + 4.05
          const dx = l.side > 0 ? -0.82 : 0.82
          return <sprite key={i} position={[l.x + dx, y, l.z]} material={haloMat} />
        })}
      </group>
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
  const allSpots = useMemo(() => treeSpots(), [])
  // near/mid trees use the hand-modelled CC0 assets; distant fogged groves keep the cheap procedural ones
  // on by default (won the side-by-side); ?assets=0 falls back to all-procedural trees
  const useAssets = ASSETS_ON
  // near = within ~65 m of the home camera and by the avenue; beyond that the cheap procedural trees take over (LOD by distance)
  const isNear = (s: { x: number; z: number }) => useAssets && Math.hypot(s.x - 8, s.z - 38) < 95 && s.z < 30 && Math.abs(s.x - roadX(s.z)) < 40
  // quality > quantity: keep ~55% of the near spots for the detailed asset trees, drop the rest entirely
  // also keep the hero frame's lower-left corner clear (a big crown there crops against the rail)
  const cornerClear = (s: { x: number; z: number }) => !(s.x - roadX(s.z) < -12 && Math.hypot(s.x - 8, s.z - 38) < 40)
  const nearSpots = useMemo(() => allSpots.filter((s) => isNear(s) && cornerClear(s) && ((s.tint * 17.3 + s.x * 0.013) % 1) < (s.x < roadX(s.z) ? 0.38 : 0.55)), [allSpots])
  const spots = useMemo(() => allSpots.filter((s) => !isNear(s)), [allSpots])
  const trees = useMemo(() => {
    const groups: { geo: THREE.BufferGeometry; spots: typeof spots }[] = []
    for (const kind of [0, 1, 2] as const) for (let v = 0; v < VARIANTS; v++) {
      const sub = spots.filter((s) => s.kind === kind && variantOf(kind, s.tint) === v)
      if (sub.length) groups.push({ geo: buildTree(kind, opts, v), spots: sub })
    }
    return groups
  }, [opts, spots])

  const mats = useMemo(() => ({
    terrain: getMaterial(style, 'terrain'),
    road: style.makeMaterial('road'),
    path: addFlagstones(style.makeMaterial('road')),
    foliage: getMaterial(style, 'foliage'),
    city: getMaterial(style, 'city'),
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
    if ('emissiveIntensity' in m) m.emissiveIntensity = smoothstep(4, -5, env.sun.elevation) * 0.85
  })

  useEffect(() => () => {
    for (const g of [terrain, road.road, road.markings, road.curbs, city, mountains, ...trees.map((t) => t.geo)]) g.dispose()
  }, [terrain, road, city, mountains, trees])

  return (
    <group>
      <mesh geometry={terrain} material={mats.terrain} receiveShadow />
      <mesh geometry={road.road} material={mats.path} receiveShadow />
      <mesh geometry={road.markings} material={mats.road} receiveShadow />
      <mesh geometry={road.curbs} material={mats.road} receiveShadow castShadow />
      <mesh geometry={city} material={mats.city} castShadow receiveShadow />
      <mesh geometry={mountains} material={mats.mountain} />
      {trees.map((t, i) => <TreeInstances key={i} geometry={t.geo} material={mats.foliage} spots={t.spots} />)}
      {nearSpots.length > 0 && <Suspense fallback={null}><AssetTrees spots={nearSpots} /></Suspense>}
      {useAssets && <Suspense fallback={null}><PathFlora /></Suspense>}
      <Lamps />
    </group>
  )
}
