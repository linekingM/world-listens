import * as THREE from 'three'
import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useWorld } from '../../state/worldStore'
import { interaction } from '../systems/interaction'
import { collideCamera, softBounds } from './cameraCollide'
import { rayGround } from '../systems/picking'

/** Shared free-roam state; the mobile HUD (joystick, up/down) writes into `input`. */
export const roam = {
  yaw: 0,
  pitch: 0,
  vel: new THREE.Vector3(),
  keys: new Set<string>(),
  input: { joyX: 0, joyY: 0, up: 0 },
  /** touch gestures: metres still to travel along the view (pinch) and up (two-finger drag), eased in per frame */
  gesture: { fwd: 0, rise: 0 },
  /** double-tap glide target (null = none) */
  glide: null as THREE.Vector3 | null,
  /** double-tap timing (ms): max tap length / max gap between taps (tests widen these: software GL is ~1 fps) */
  tapMs: 300, doubleTapMs: 380,
  /** paused while a scripted glide (save auto-framing) owns the camera */
  paused: false,
  /** re-derive yaw/pitch from where the camera currently looks */
  sync(camera: THREE.Camera) {
    const d = camera.getWorldDirection(new THREE.Vector3())
    this.yaw = Math.atan2(-d.x, -d.z)
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))
    this.vel.set(0, 0, 0)
  },
}

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyC', 'Space', 'ShiftLeft', 'ShiftRight'])
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}
const LOOK = 0.0032, LOOK_TOUCH = 0.0055, MAX_PITCH = 1.45
/** pinch: metres per pixel of finger-distance change; two-finger vertical drag: metres per pixel */
const PINCH_M = 0.16, RISE_M = 0.09
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _hit = new THREE.Vector3()
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3()

/** Game-style explore camera: WASD/arrows walk, drag (or pointer lock) to look, E/Space up, Q/C down, Shift sprint. */
export function FreeRoam() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    roam.sync(camera)
    const el = gl.domElement
    let down: { x: number; y: number; id: number } | null = null
    const look = (dx: number, dy: number) => {
      roam.yaw -= dx * LOOK
      roam.pitch = THREE.MathUtils.clamp(roam.pitch - dy * LOOK, -MAX_PITCH, MAX_PITCH)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (!MOVE_CODES.has(e.code)) return
      roam.keys.add(e.code)
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => { roam.keys.delete(e.code) }
    const clear = () => { roam.keys.clear(); down = null }
    // ── touch: own pointer-id bookkeeping (joystick / buttons are DOM elements and never reach the canvas) ──
    const touches = new Map<number, { x: number; y: number }>()
    let pair: { dist: number; cy: number } | null = null
    let tap: { x: number; y: number; t: number; moved: boolean } | null = null
    let lastTap: { x: number; y: number; t: number } | null = null
    const pairInfo = () => {
      const [a, b] = [...touches.values()]
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), cy: (a.y + b.y) / 2 }
    }
    // double-tap: glide to the surface under the finger (ground, island, roof), stopping short at a safe height
    const glideTo = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect()
      _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
      _ray.setFromCamera(_ndc, camera)
      _ray.far = 500
      let point: THREE.Vector3 | null = null
      for (const h of _ray.intersectObjects(scene.children, true)) {
        const o = h.object as THREE.Mesh
        const m = o.material as THREE.Material | undefined
        if (!(o as THREE.Mesh).isMesh || !m || m.transparent || !o.visible) continue
        point = h.point; break
      }
      if (!point) point = rayGround(_ray.ray, _hit, 500)
      if (!point) return
      const to = point.clone()
      // stop ~5 m short of the spot (along the approach) and 3 m above it; collisions / ground clamp still apply
      const back = camera.position.clone().sub(to).setY(0)
      if (back.lengthSq() > 1e-4) to.addScaledVector(back.normalize(), Math.min(5, back.length()))
      to.y = point.y + 3
      roam.glide = to
      roam.vel.set(0, 0, 0)
    }
    const onTouchDown = (e: PointerEvent) => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size === 1) tap = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }
      else { tap = null; down = null }
      if (touches.size === 2) pair = pairInfo()
      roam.glide = null
    }
    const onTouchMove = (e: PointerEvent) => {
      const p = touches.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      p.x = e.clientX; p.y = e.clientY
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap.moved = true
      if (touches.size === 1) { look(dx * (LOOK_TOUCH / LOOK), dy * (LOOK_TOUCH / LOOK)); return }
      if (touches.size === 2 && pair) {
        const now = pairInfo()
        // pinch apart = forward, together = back; both fingers moving up = rise, down = descend
        roam.gesture.fwd += (now.dist - pair.dist) * PINCH_M
        roam.gesture.rise += -(now.cy - pair.cy) * RISE_M
        pair = now
      }
    }
    const onTouchUp = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return
      pair = touches.size === 2 ? pairInfo() : null
      if (touches.size === 0 && tap && !tap.moved && performance.now() - tap.t < roam.tapMs) {
        const t = performance.now()
        if (lastTap && t - lastTap.t < roam.doubleTapMs && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) { glideTo(e.clientX, e.clientY); lastTap = null }
        else lastTap = { x: e.clientX, y: e.clientY, t }
      }
      if (touches.size === 0) tap = null
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { onTouchDown(e); return }
      if (e.button === 0) down = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { onTouchMove(e); return }
      if (document.pointerLockElement === el) { look(e.movementX, e.movementY); return }
      if (!down || e.pointerId !== down.id) return
      // dragging an object / cloud / the sun owns the pointer
      if (interaction.drag || useWorld.getState().dragging) { down = null; return }
      look(e.clientX - down.x, e.clientY - down.y)
      down.x = e.clientX; down.y = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { onTouchUp(e); return }
      if (down && e.pointerId === down.id) down = null
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clear)
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clear)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (document.pointerLockElement === el) document.exitPointerLock()
      clear()
      roam.input.joyX = roam.input.joyY = roam.input.up = 0
      roam.gesture.fwd = roam.gesture.rise = 0
      roam.glide = null
    }
  }, [camera, gl, scene])

  useFrame((_, rawDt) => {
    if (roam.paused) return
    const dt = Math.min(rawDt, 0.25)
    const k = roam.keys, inp = roam.input
    const fw = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + inp.joyY
    const st = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + inp.joyX
    const up = (k.has('KeyE') || k.has('Space') ? 1 : 0) - (k.has('KeyQ') || k.has('KeyC') ? 1 : 0) + inp.up
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight')
    _f.set(-Math.sin(roam.yaw), 0, -Math.cos(roam.yaw))
    _r.set(Math.cos(roam.yaw), 0, -Math.sin(roam.yaw))
    _w.set(0, 0, 0).addScaledVector(_f, fw).addScaledVector(_r, st)
    _w.y = up
    if (_w.lengthSq() > 1) _w.normalize()
    _w.multiplyScalar(sprint ? 42 : 14)
    // smooth acceleration / deceleration
    roam.vel.lerp(_w, 1 - Math.exp(-dt * 4.5))
    camera.position.addScaledVector(roam.vel, dt)
    // touch gestures: ease the pending pinch / rise distance in (smooth, proportional to the finger motion)
    const g = roam.gesture
    if (g.fwd || g.rise) {
      const e = 1 - Math.exp(-dt * 7)
      const f = g.fwd * e, u = g.rise * e
      g.fwd -= f; g.rise -= u
      if (Math.abs(g.fwd) < 0.01) g.fwd = 0
      if (Math.abs(g.rise) < 0.01) g.rise = 0
      // pinch moves along the full view direction (pitch included), so you can dive toward what you look at
      camera.position.x += -Math.sin(roam.yaw) * Math.cos(roam.pitch) * f
      camera.position.z += -Math.cos(roam.yaw) * Math.cos(roam.pitch) * f
      camera.position.y += Math.sin(roam.pitch) * f + u
    }
    // double-tap glide; any walking input cancels it
    if (roam.glide) {
      if (fw || st || up) roam.glide = null
      else {
        camera.position.lerp(roam.glide, 1 - Math.exp(-dt * 2.6))
        if (camera.position.distanceTo(roam.glide) < 0.3) roam.glide = null
      }
    }
    softBounds(camera.position, dt)
    collideCamera(camera.position, useWorld.getState().objects, 1.8)
    camera.rotation.set(roam.pitch, roam.yaw, 0, 'YXZ')
  })
  return null
}

// test / screenshot hook (read-only use in e2e; setting yaw/pitch + camera position places the explorer)
;(window as unknown as { __roam: typeof roam }).__roam = roam
