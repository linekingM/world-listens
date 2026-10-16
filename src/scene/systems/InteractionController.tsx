import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useWorld } from '../../state/worldStore'
import type { Vec3 } from '../../state/types'
import { interaction, type DragKind } from './interaction'
import { CLOUD_BOUNDS, clampXZ, groundAt, rayGround, rayPlaneY } from './picking'
import { sunAt, SUNRISE, SUNSET } from '../../world/sun'

const hit = new THREE.Vector3()
const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const tmpDir = new THREE.Vector3()
type Ctl = { enabled: boolean } | null
let controlsRef: Ctl = null

/** True if terrain is closer along the ray than `dist` (so the thing is hidden behind a hill). */
export function occludedByGround(r: THREE.Ray, dist: number) {
  const g = rayGround(r, hit, Math.min(dist, 900))
  return !!g && g.distanceTo(r.origin) < dist - 2
}

/** Start dragging something from a 3D pointer-down handler. */
export function beginDrag(e: ThreeEvent<PointerEvent>, kind: DragKind, id: string, rest: Vec3, planeY?: number) {
  e.stopPropagation()
  interaction.pressConsumed = true
  const grab = new THREE.Vector3()
  if (kind !== 'sun') {
    const h = planeY !== undefined ? rayPlaneY(e.ray, planeY, hit) : rayGround(e.ray, hit)
    if (h) grab.set(rest[0] - h.x, 0, rest[2] - h.z)
  }
  interaction.drag = { kind, id, planeY, grab, startX: e.nativeEvent.clientX, startY: e.nativeEvent.clientY, moved: false, pointerId: e.nativeEvent.pointerId }
  if (controlsRef) controlsRef.enabled = false
  useWorld.getState().setDragging(true)
}

/** Find the hour whose sun direction best matches a view ray (drag the sun along its arc). */
function hourFromRay(dir: THREE.Vector3) {
  let best = 12, bestDot = -2
  for (let h = SUNRISE - 0.9; h <= SUNSET + 0.9; h += 0.04) {
    const d = sunAt(h, tmpDir).dir
    const dot = d.dot(dir)
    if (dot > bestDot) { bestDot = dot; best = h }
  }
  return best
}

export function InteractionController() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as Ctl
  useEffect(() => { controlsRef = controls }, [controls])

  useEffect(() => {
    const el = gl.domElement
    let downX = 0, downY = 0, downOnCanvas = false
    const setRay = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect()
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      return ray.ray
    }
    const updateGhost = (cx: number, cy: number) => {
      const r = setRay(cx, cy)
      const g = rayGround(r, hit)
      interaction.ghostValid = !!g
      if (g) { clampXZ(g); interaction.ghost.set(g.x, groundAt(g.x, g.z), g.z) }
    }
    const onDown = (e: PointerEvent) => {
      // runs before R3F's handlers (they listen on the parent): reset the press flag
      interaction.pressConsumed = false
      downX = e.clientX; downY = e.clientY; downOnCanvas = true
      if (useWorld.getState().placing) updateGhost(e.clientX, e.clientY)
    }
    const onMove = (e: PointerEvent) => {
      const st = useWorld.getState()
      const d = interaction.drag
      if (d) {
        if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return
        d.moved = true
        const r = setRay(e.clientX, e.clientY)
        if (d.kind === 'sun') {
          st.setTime(hourFromRay(r.direction), 'drag')
          return
        }
        if (d.kind === 'cloud') {
          const h = rayPlaneY(r, d.planeY!, hit)
          if (!h) return
          h.add(d.grab)
          clampXZ(h, CLOUD_BOUNDS)
          st.moveCloud(d.id, [h.x, d.planeY!, h.z])
          return
        }
        const o = st.objects.find((x) => x.id === d.id)
        if (!o) return
        if (d.planeY !== undefined) {
          const h = rayPlaneY(r, d.planeY, hit)
          if (!h) return
          h.add(d.grab); clampXZ(h)
          st.updateObject(d.id, { pos: [h.x, d.planeY, h.z] })
        } else {
          const h = rayGround(r, hit)
          if (!h) return
          h.add(d.grab); clampXZ(h)
          st.updateObject(d.id, { pos: [h.x, groundAt(h.x, h.z), h.z] })
        }
        return
      }
      if (st.placing && e.target === el) updateGhost(e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      const st = useWorld.getState()
      const d = interaction.drag
      if (d) {
        interaction.drag = null
        if (controlsRef) controlsRef.enabled = true
        st.setDragging(false)
        return
      }
      if (!downOnCanvas) return
      downOnCanvas = false
      const click = Math.hypot(e.clientX - downX, e.clientY - downY) < 6
      if (!click) return
      if (st.placing) {
        updateGhost(e.clientX, e.clientY)
        if (!interaction.ghostValid) return
        const g = interaction.ghost
        const type = st.placing
        const pos: Vec3 = type === 'island' ? [g.x, Math.max(g.y + 22, 24), g.z] : [g.x, g.y, g.z]
        st.addObject(type, pos)
        st.setPlacing(null)
        st.toast(type === 'island' ? '浮岛已升起 · 拖动它来移动' : '已放置 · 拖动可移动，工具条可旋转或删除', 'ok')
        return
      }
      if (!interaction.pressConsumed && st.selectedId) st.select(null)
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [gl, camera])
  return null
}
