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
import { getSim, stepSim, sims } from '../systems/simulation'
import { beginDrag } from '../systems/InteractionController'
import { interaction } from '../systems/interaction'
import { groundAt } from '../systems/picking'
import { OBJECT_KINDS, objectRadius } from '../../world/objects'
import type { IslandSpec } from '../../world/layout'
import { smoothstep } from '../../lib/random'
import { overlayRef } from '../../ui/overlay'
import { Icon } from '../../ui/icons'

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

function islandTopY(spec: IslandSpec, x: number, z: number) {
  const r2 = (x * x + z * z) / Math.pow(spec.radius * 0.85, 2)
  return spec.radius * 0.16 * Math.sqrt(Math.max(0, 1 - r2)) - 0.15
}

// ───────── visuals ─────────
export function IslandVisual({ variant }: { variant: number }) {
  const style = useStyleDef()
  const g = useMemo(() => islandGeometries(style, variant), [style, variant])
  const { spec } = g
  const rock = getMaterial(style, 'rock'), bld = getMaterial(style, 'building'), fol = getMaterial(style, 'foliage')
  return (
    <>
      <mesh geometry={g.rock} material={rock} castShadow receiveShadow />
      {spec.houses.map((h, i) => (
        <mesh key={i} geometry={g.houses[i]} material={bld} position={[h.x, islandTopY(spec, h.x, h.z), h.z]} rotation-y={h.rot} scale={h.s} castShadow receiveShadow />
      ))}
      {spec.trees.map((t, i) => (
        <mesh key={i} geometry={g.tree} material={fol} position={[t.x, islandTopY(spec, t.x, t.z) - 0.1, t.z]} scale={t.s * 0.85} rotation-y={i * 1.7} castShadow receiveShadow />
      ))}
      {spec.waterfall && <Waterfall position={[spec.radius * 0.78, 0.2, spec.radius * 0.3]} rotationY={Math.PI / 2 + 0.35} height={spec.radius * 1.9} width={spec.radius * 0.12} />}
    </>
  )
}

export function ObjectVisual({ obj }: { obj: Pick<WorldObject, 'type' | 'variant'> }) {
  const style = useStyleDef()
  if (obj.type === 'island') return <IslandVisual variant={obj.variant} />
  const geo = objectGeometry(style, obj.type, obj.variant)
  const role = obj.type === 'tree' || obj.type === 'pine' ? 'foliage' : obj.type === 'rock' ? 'rock' : obj.type === 'house' || obj.type === 'tower' ? 'building' : 'prop'
  return (
    <>
      <mesh geometry={geo} material={getMaterial(style, role)} castShadow receiveShadow />
      {obj.type === 'lamp' && <mesh geometry={bulbGeo} material={bulbMat} position={[-0.82, 4.05, 0]} />}
    </>
  )
}

// ───────── editable object ─────────
const _v = new THREE.Vector3()

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
    const dt = Math.min(rawDt, 0.05)
    const o = objRef.current
    const st = useWorld.getState()
    const s = getSim(o.id)
    const t = state.clock.elapsedTime
    stepSim(o, s, env.gravity, st.orbit, t, dt)
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
    blobMat.opacity = (kind.airborne ? 0.32 * smoothstep(90, 15, height) : 0.42 * smoothstep(16, 0, height)) * vis * (1 - env.weather.mist * 0.5)
    bm.visible = blobMat.opacity > 0.01
    if (ring.current) {
      ring.current.position.set(b.position.x, (kind.airborne ? b.position.y + 0.4 : gy) + 0.1, b.position.z)
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
        {selected && <ObjectToolbar obj={obj} height={(kind.airborne ? 4 : kind.height) * obj.scale + 1.2} />}
      </group>
      <mesh ref={blob} geometry={planeGeo} material={blobMat} raycast={noRaycast} renderOrder={1} />
      {selected && <mesh ref={ring} geometry={planeGeo} material={ringMat} raycast={noRaycast} renderOrder={3} />}
    </>
  )
})

function ToolBtn({ icon, label, onClick, danger, active }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button className={`tb-btn${danger ? ' danger' : ''}${active ? ' on' : ''}`} onClick={onClick} title={label} aria-label={label} data-act={label}>
      <Icon name={icon} size={18} />
    </button>
  )
}

function ObjectToolbar({ obj, height }: { obj: WorldObject; height: number }) {
  const st = useWorld.getState()
  const kind = OBJECT_KINDS[obj.type]
  const up = (patch: Partial<WorldObject>) => st.updateObject(obj.id, patch)
  return (
    <Html position={[0, height, 0]} center portal={overlayRef as React.MutableRefObject<HTMLElement>} zIndexRange={[30, 10]} className="obj-toolbar-anchor">
      <div className="obj-toolbar glass" data-testid="obj-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <span className="tb-label">{kind.label}</span>
        <ToolBtn icon="rotL" label="向左转" onClick={() => up({ rotY: obj.rotY + Math.PI / 6 })} />
        <ToolBtn icon="rotR" label="向右转" onClick={() => up({ rotY: obj.rotY - Math.PI / 6 })} />
        <ToolBtn icon="minus" label="缩小" onClick={() => up({ scale: Math.max(0.4, +(obj.scale / 1.15).toFixed(2)) })} />
        <ToolBtn icon="plus" label="放大" onClick={() => up({ scale: Math.min(kind.airborne ? 1.8 : 2.5, +(obj.scale * 1.15).toFixed(2)) })} />
        {kind.airborne ? (
          <>
            <ToolBtn icon="up" label="升高" onClick={() => up({ pos: [obj.pos[0], Math.min(90, obj.pos[1] + 4), obj.pos[2]] })} />
            <ToolBtn icon="down" label="降低" onClick={() => up({ pos: [obj.pos[0], Math.max(groundAt(obj.pos[0], obj.pos[2]) + 12, obj.pos[1] - 4), obj.pos[2]] })} />
          </>
        ) : (
          <ToolBtn icon="float" label={obj.floating ? '落回地面' : '漂浮起来'} active={!!obj.floating} onClick={() => st.toggleFloat(obj.id)} />
        )}
        <span className="tb-sep" />
        <ToolBtn icon="trash" label="删除" danger onClick={() => { st.removeObject(obj.id); sims.delete(obj.id); st.toast(`已删除${kind.label}`) }} />
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
    bulbMat.color.setRGB(1, 0.85, 0.6).multiplyScalar(0.25 + on * 5)
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
