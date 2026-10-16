import { memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useWorld } from '../../state/worldStore'
import type { CloudObject, WorldObject } from '../../state/types'
import { useEnv, useStyleDef } from '../common/EnvContext'
import { getMaterial } from '../common/materials'
import { Waterfall } from '../common/Waterfall'
import { islandGeometries, objectGeometry } from './geoCache'
import { getSim, stepSim } from '../systems/simulation'
import { beginDrag } from '../systems/InteractionController'
import { interaction } from '../systems/interaction'
import { groundAt } from '../systems/picking'
import { OBJECT_KINDS, objectRadius } from '../../world/objects'
import type { IslandSpec } from '../../world/layout'
import { smoothstep } from '../../lib/random'
import { overlayRef } from '../../ui/overlay'
import { ObjectActions, useIsCompact } from '../../ui/SelectionActions'

// ───────── shared bits ─────────
function radialTexture(stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128
  const g = cv.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  for (const [o, c] of stops) grd.addColorStop(o, c)
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  return t
}
const blobTex = radialTexture([[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']])
const ringTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const g = cv.getContext('2d')!
  g.strokeStyle = 'rgba(255,240,200,1)'; g.lineWidth = 7
  g.shadowColor = 'rgba(255,214,140,1)'; g.shadowBlur = 18
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke()
  g.lineWidth = 2; g.setLineDash([10, 14]); g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke()
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  return t
})()
const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, toneMapped: false, color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -4 })
export const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false })
const bulbGeo = new THREE.SphereGeometry(0.13, 8, 6)
const noRaycast = () => null
function outlineMaterial(thickness: number) {
  const m = new THREE.MeshBasicMaterial({ color: '#ffe1a8', side: THREE.BackSide, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, fog: false })
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${thickness.toFixed(3)};`)
  }
  m.customProgramCacheKey = () => 'outline' + thickness
  return m
}
export const outlineSmall = outlineMaterial(0.07)
export const outlineIsland = outlineMaterial(0.32)

function islandTopY(spec: IslandSpec, x: number, z: number) {
  const r2 = (x * x + z * z) / Math.pow(spec.radius * 0.85, 2)
  return spec.radius * 0.16 * Math.sqrt(Math.max(0, 1 - r2)) - 0.15
}

// ───────── visuals ─────────
const skirtTex = (() => {
  // soft procedural wisp: many faint overlapping puffs, fully transparent at every edge
  const W = 256, H = 128
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')!
  let seed = 9
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 26; i++) {
    const x = W * (0.2 + r() * 0.6), y = H * (0.35 + r() * 0.3), rad = H * (0.18 + r() * 0.22)
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.08)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd; g.fillRect(0, 0, W, H)
  }
  // feather the whole thing with an elliptical mask
  g.globalCompositeOperation = 'destination-in'
  const m = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2)
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.55, 'rgba(0,0,0,0.8)'); m.addColorStop(1, 'rgba(0,0,0,0)')
  g.setTransform(1, 0, 0, H / W, 0, H / 2 - H / 2 * 1)
  g.fillStyle = m; g.fillRect(0, 0, W, W)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  return t
})()
const skirtMats: THREE.SpriteMaterial[] = []
/** Soft cloud wisps clinging to an island's underside (sea-of-clouds mood). */
function CloudSkirt({ radius, depth, seed }: { radius: number; depth: number; seed: number }) {
  const mats = useMemo(() => Array.from({ length: 4 }, (_, i) => {
    const m = new THREE.SpriteMaterial({ map: skirtTex, transparent: true, depthWrite: false, opacity: 0.5, fog: true })
    skirtMats.push(m)
    return m
  }), [seed])
  return (
    <group>
      {mats.map((m, i) => {
        const a = seed * 2.3 + i * (Math.PI / 2) + 0.4
        const r = radius * (0.45 + (i % 2) * 0.25)
        const sz = radius * (1.5 + (i % 3) * 0.35)
        return <sprite key={i} material={m} position={[Math.cos(a) * r, -depth * (0.32 + (i % 2) * 0.16), Math.sin(a) * r]} scale={[sz * 1.6, sz * 0.7, 1]} renderOrder={2} />
      })}
    </group>
  )
}

export function IslandVisual({ variant, override }: { variant: number; override?: THREE.Material }) {
  const style = useStyleDef()
  const g = useMemo(() => islandGeometries(style, variant), [style, variant])
  const { spec } = g
  const rock = override ?? getMaterial(style, 'rock'), bld = override ?? getMaterial(style, 'building'), fol = override ?? getMaterial(style, 'foliage')
  return (
    <>
      <mesh geometry={g.rock} material={rock} castShadow={!override} receiveShadow={!override} />
      {spec.houses.map((h, i) => (
        <mesh key={i} geometry={g.houses[i]} material={bld} position={[h.x, islandTopY(spec, h.x, h.z), h.z]} rotation-y={h.rot} scale={h.s} castShadow={!override} receiveShadow={!override} />
      ))}
      {spec.trees.map((t, i) => (
        <mesh key={i} geometry={g.tree} material={fol} position={[t.x, islandTopY(spec, t.x, t.z) - 0.1, t.z]} scale={t.s * 0.85} rotation-y={i * 1.7} castShadow={!override} receiveShadow={!override} />
      ))}
      {!override && <CloudSkirt radius={spec.radius} depth={spec.depth} seed={spec.seed} />}
      {!override && spec.waterfall && <Waterfall position={[spec.radius * 0.78, 0.2, spec.radius * 0.3]} rotationY={Math.PI / 2 + 0.35} height={spec.radius * 1.9} width={spec.radius * 0.3} />}
    </>
  )
}

export function ObjectVisual({ obj, override }: { obj: Pick<WorldObject, 'type' | 'variant'>; override?: THREE.Material }) {
  const style = useStyleDef()
  if (obj.type === 'island') return <IslandVisual variant={obj.variant} override={override} />
  const geo = objectGeometry(style, obj.type, obj.variant)
  const role = obj.type === 'tree' || obj.type === 'pine' ? 'foliage' : obj.type === 'rock' ? 'rock' : obj.type === 'house' || obj.type === 'tower' ? 'building' : 'prop'
  return (
    <>
      <mesh geometry={geo} material={override ?? getMaterial(style, role)} castShadow={!override} receiveShadow={!override} raycast={override ? noRaycast : undefined} />
      {!override && obj.type === 'lamp' && <mesh geometry={bulbGeo} material={bulbMat} position={[-0.82, 4.05, 0]} />}
    </>
  )
}

// ───────── editable object ─────────
const _v = new THREE.Vector3()
const _c = new THREE.Color(), _c2 = new THREE.Color()

const EditableObject = memo(function EditableObject({ obj, selected }: { obj: WorldObject; selected: boolean }) {
  const env = useEnv()
  const body = useRef<THREE.Group>(null!)
  const blob = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const kind = OBJECT_KINDS[obj.type]
  const radius = objectRadius(obj.type, obj.variant, obj.scale)
  const blobMat = useMemo(() => new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: '#1d2a3a', opacity: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }), [])
  const objRef = useRef(obj)
  objRef.current = obj

  useFrame((state, rawDt) => {
    const o = objRef.current
    const st = useWorld.getState()
    const s = getSim(o.id)
    const t = state.clock.elapsedTime
    // fixed sub-steps: the same motion at 2 fps and at 120 fps (stable springs, no slow-motion on weak GPUs)
    let left = Math.min(rawDt, 0.5)
    while (left > 1e-4) { const h = Math.min(0.033, left); stepSim(o, s, env.gravity, st.orbit, t, h); left -= h }
    const bob = kind.airborne ? Math.sin(t * 0.35 + s.phase) * 0.8 : 0
    const b = body.current
    b.position.set(o.pos[0] + s.off.x, o.pos[1] + s.off.y + bob, o.pos[2] + s.off.z)
    b.rotation.set(s.rot.x, o.rotY + s.rot.y, s.rot.z)
    // soft contact shadow on the ground under the object (fades as it rises)
    const gy = groundAt(b.position.x, b.position.z)
    const height = Math.max(0, b.position.y - gy)
    const bm = blob.current
    bm.position.set(b.position.x, gy + 0.06, b.position.z)
    const spread = kind.airborne ? 1.5 + height * 0.02 : 1.25 + height * 0.06
    bm.scale.setScalar(radius * 2 * spread)
    const vis = env.sun.day * 0.65 + 0.2
    blobMat.opacity = (kind.airborne ? 0.36 * smoothstep(90, 15, height) : 0.55 * smoothstep(16, 0, height)) * vis * (1 - env.weather.mist * 0.5)
    bm.visible = blobMat.opacity > 0.01
    if (selected) { outlineSmall.opacity = outlineIsland.opacity = 0.55 + Math.sin(t * 3) * 0.25 }
    if (ring.current) {
      ring.current.position.set(b.position.x, (kind.airborne ? b.position.y + radius * 0.17 : gy) + 0.1, b.position.z)
      ring.current.scale.setScalar(radius * 2.5 * (1 + Math.sin(t * 3) * 0.03))
    }
  })

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const st = useWorld.getState()
    if (st.placing || e.button !== 0) return
    st.select(obj.id)
    beginDrag(e, 'object', obj.id, obj.pos, kind.airborne ? obj.pos[1] : undefined)
  }

  return (
    <>
      <group ref={body} onPointerDown={onDown} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'grab' }} onPointerOut={() => { document.body.style.cursor = '' }}>
        <group scale={obj.scale}><ObjectVisual obj={obj} /></group>
        {selected && <group scale={obj.scale}><ObjectVisual obj={obj} override={kind.airborne ? outlineIsland : outlineSmall} /></group>}
        {selected && <ObjectToolbar obj={obj} height={kind.airborne ? radius * 0.3 + 7 : kind.height * obj.scale + 1.2} />}
      </group>
      <mesh ref={blob} geometry={planeGeo} material={blobMat} raycast={noRaycast} renderOrder={1} />
      {selected && <mesh ref={ring} geometry={planeGeo} material={ringMat} raycast={noRaycast} renderOrder={3} />}
    </>
  )
})

function ObjectToolbar({ obj, height }: { obj: WorldObject; height: number }) {
  const compact = useIsCompact()
  if (compact) return null
  return (
    <Html position={[0, height, 0]} center portal={overlayRef as React.MutableRefObject<HTMLElement>} zIndexRange={[30, 10]}>
      <div className="obj-toolbar glass" data-testid="obj-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <ObjectActions obj={obj} />
      </div>
    </Html>
  )
}

/** Renders every editable object from the world document. */
export function WorldObjects() {
  const objects = useWorld((s) => s.objects)
  const selectedId = useWorld((s) => s.selectedId)
  const env = useEnv()
  useFrame(() => {
    const on = smoothstep(2, -6, env.sun.elevation)
    bulbMat.color.setRGB(1, 0.85, 0.6).multiplyScalar(0.25 + on * 2.6)
    // island cloud skirts pick up sky / sun colour
    const L = env.light
    _c.copy(L.hemiSky).multiplyScalar(0.55 * L.hemiI).add(_c2.copy(L.sun).multiplyScalar(0.22 * L.sunI)).lerp(L.fog, 0.25)
    for (const m of skirtMats) { m.color.copy(_c); m.opacity = 0.8 + env.weather.mist * 0.2 }
  })
  return (
    <group>
      {objects.map((o) => <EditableObject key={o.id} obj={o} selected={o.id === selectedId} />)}
      <PlacementGhost />
    </group>
  )
}

// ───────── placement ghost ─────────
function PlacementGhost() {
  const placing = useWorld((s) => s.placing)
  const g = useRef<THREE.Group>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  useFrame((s) => {
    if (!g.current) return
    const p = interaction.ghost
    const lift = placing === 'island' ? Math.max(22, 24 - p.y) : 0
    g.current.position.set(p.x, p.y + lift + Math.sin(s.clock.elapsedTime * 3) * 0.15, p.z)
    g.current.visible = interaction.ghostValid
    ring.current.position.set(p.x, p.y + 0.12, p.z)
    ring.current.visible = interaction.ghostValid
    ring.current.scale.setScalar(_v.setScalar(1).x * (placing ? objectRadius(placing, 3, 1) * 2.6 : 1) * (1 + Math.sin(s.clock.elapsedTime * 4) * 0.05))
  })
  if (!placing) return null
  return (
    <>
      <group ref={g} raycast={noRaycast}><ObjectVisual obj={{ type: placing, variant: placing === 'island' ? 3 : 0 }} /></group>
      <mesh ref={ring} geometry={planeGeo} material={ringMat} raycast={noRaycast} renderOrder={3} />
    </>
  )
}

// ───────── interactive clouds helper (hit volume) ─────────
export const cloudHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
export type { CloudObject }
