import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Cloud, Clouds, Html } from '@react-three/drei'
import { cloudSea, horizonClouds, type CloudSpec } from '../../../world/layout'
import { useEnv } from '../../common/EnvContext'
import { useWorld } from '../../../state/worldStore'
import type { CloudObject } from '../../../state/types'
import { beginDrag, occludedByGround } from '../../systems/InteractionController'
import { cloudHitMat } from '../../objects/WorldObjects'
import { overlayRef } from '../../../ui/overlay'
import { CloudActions, useIsCompact } from '../../../ui/SelectionActions'
import { rng } from '../../../lib/random'

const WHITE = new THREE.Color('#ffffff'), GREY = new THREE.Color('#9aa6b4')
const WARM = new THREE.Color()
const hitGeo = new THREE.SphereGeometry(1, 12, 8)

/** Extra clouds that gather overhead when the weather turns cloudy. */
function gatherSpecs(): CloudSpec[] {
  const r = rng(555)
  const out: CloudSpec[] = []
  for (let i = 0; i < 7; i++) out.push({ pos: [-170 + i * 52 + r() * 20, 70 + r() * 25, -120 - r() * 160], scale: 1.1 + r() * 0.7, seed: 90 + i })
  return out
}

function CloudToolbar({ c, y }: { c: CloudObject; y: number }) {
  const compact = useIsCompact()
  if (compact) return null
  return (
    <Html position={[0, y, 0]} center portal={overlayRef as React.MutableRefObject<HTMLElement>} zIndexRange={[30, 10]}>
      <div className="obj-toolbar glass" data-testid="cloud-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <CloudActions cloud={c} />
      </div>
    </Html>
  )
}

function HeroCloud({ c, selected }: { c: CloudObject; selected: boolean }) {
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const st = useWorld.getState()
    if (st.placing || e.button !== 0) return
    if (occludedByGround(e.ray, e.distance)) return
    st.select(c.id)
    beginDrag(e, 'cloud', c.id, c.pos, c.pos[1])
  }
  return (
    <group position={c.pos}>
      <Cloud
        seed={c.seed + 1}
        bounds={[46 * c.scale, 7 * c.scale, 14 * c.scale]}
        segments={Math.round(26 + c.scale * 8)}
        volume={26 * c.scale}
        smallestVolume={0.4}
        concentrate="inside"
        growth={3}
        speed={0.08}
        fade={10}
        opacity={0.8}
        color="#ffffff"
      />
      <mesh
        geometry={hitGeo}
        material={cloudHitMat}
        scale={[30 * c.scale, 9 * c.scale, 12 * c.scale]}
        onPointerDown={onDown}
        onPointerOver={(e) => { if (!occludedByGround(e.ray, e.distance)) { e.stopPropagation(); document.body.style.cursor = 'grab' } }}
        onPointerOut={() => { document.body.style.cursor = '' }}
      />
      {selected && <CloudToolbar c={c} y={12 * c.scale + 4} />}
    </group>
  )
}

function GatherCloud({ spec, index }: { spec: CloudSpec; index: number }) {
  const env = useEnv()
  const g = useRef<THREE.Group>(null!)
  useFrame(() => {
    // each cloud grows in at a slightly different cover threshold → natural gathering
    const k = THREE.MathUtils.smoothstep(env.weather.cover, 0.35 + index * 0.05, 0.75 + index * 0.025)
    g.current.scale.setScalar(Math.max(0.001, k))
    g.current.visible = k > 0.01
  })
  return (
    <group ref={g} position={spec.pos}>
      <Cloud seed={spec.seed} bounds={[50 * spec.scale, 8 * spec.scale, 18 * spec.scale]} segments={28} volume={28 * spec.scale} smallestVolume={0.4} concentrate="inside" growth={3} speed={0.1} fade={10} opacity={0.85} color="#ffffff" />
    </group>
  )
}

/** Soft, lit volumetric-sprite clouds that pick up sun colour at golden hour and grey under overcast. */
export function CloudsA() {
  const env = useEnv()
  const horizon = useMemo(() => horizonClouds(), [])
  const sea = useMemo(() => cloudSea(), [])
  const gather = useMemo(() => gatherSpecs(), [])
  const clouds = useWorld((s) => s.clouds)
  const selectedId = useWorld((s) => s.selectedId)
  const group = useRef<THREE.Group>(null!)
  const tint = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const L = env.light
    const cover = env.weather.cover
    tint.copy(L.fog).lerp(L.hemiSky, 0.3).lerp(WHITE, env.sun.day * (0.35 + (1 - env.sun.golden) * 0.4)).lerp(GREY, cover * 0.45 * env.sun.day)
    group.current.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined
      if (m && 'emissive' in m) m.emissive.copy(tint).multiplyScalar((0.3 + env.sun.day * (0.3 + (1 - env.sun.golden) * 0.25)) * (1 - cover * 0.25)).add(WARM.copy(L.sun).multiplyScalar(env.sun.golden * 0.18 * (1 - cover)))
    })
  })
  return (
    <group ref={group}>
      <Clouds texture="/tex/cloud.png" material={THREE.MeshLambertMaterial} limit={1800} frustumCulled={false}>
        {horizon.map((c, i) => (
          <Cloud key={'h' + i} seed={c.seed + 1} position={c.pos} bounds={[46 * c.scale, 7 * c.scale, 14 * c.scale]} segments={Math.round(30 + c.scale * 10)} volume={26 * c.scale} smallestVolume={0.4} concentrate="inside" growth={3} speed={0.06} fade={10} opacity={0.8} color="#ffffff" />
        ))}
        {sea.map((c, i) => (
          <Cloud key={'s' + i} seed={c.seed} position={c.pos} bounds={[80 * c.scale, 3 * c.scale, 34 * c.scale]} segments={30} volume={30 * c.scale} smallestVolume={0.5} concentrate="outside" growth={4} speed={0.04} fade={30} opacity={0.75} color="#ffffff" />
        ))}
        {gather.map((c, i) => <GatherCloud key={'g' + i} spec={c} index={i} />)}
        {clouds.map((c) => <HeroCloud key={c.id} c={c} selected={c.id === selectedId} />)}
      </Clouds>
    </group>
  )
}
