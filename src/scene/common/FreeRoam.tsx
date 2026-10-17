import * as THREE from 'three'
import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useWorld } from '../../state/worldStore'
import { interaction } from '../systems/interaction'
import { collideCamera, softBounds } from './cameraCollide'

/** Shared free-roam state; the mobile HUD (joystick, up/down) writes into `input`. */
export const roam = {
  yaw: 0,
  pitch: 0,
  vel: new THREE.Vector3(),
  keys: new Set<string>(),
  input: { joyX: 0, joyY: 0, up: 0 },
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
const LOOK = 0.0032, MAX_PITCH = 1.45
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3()

/** Game-style explore camera: WASD/arrows walk, drag (or pointer lock) to look, E/Space up, Q/C down, Shift sprint. */
export function FreeRoam() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
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
    const onDown = (e: PointerEvent) => { if (e.button === 0 || e.pointerType === 'touch') down = { x: e.clientX, y: e.clientY, id: e.pointerId } }
    const onMove = (e: PointerEvent) => {
      if (document.pointerLockElement === el) { look(e.movementX, e.movementY); return }
      if (!down || e.pointerId !== down.id) return
      // dragging an object / cloud / the sun owns the pointer
      if (interaction.drag || useWorld.getState().dragging) { down = null; return }
      look(e.clientX - down.x, e.clientY - down.y)
      down.x = e.clientX; down.y = e.clientY
    }
    const onUp = (e: PointerEvent) => { if (down && e.pointerId === down.id) down = null }
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
    }
  }, [camera, gl])

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
    softBounds(camera.position, dt)
    collideCamera(camera.position, useWorld.getState().objects, 1.8)
    camera.rotation.set(roam.pitch, roam.yaw, 0, 'YXZ')
  })
  return null
}

// test / screenshot hook (read-only use in e2e; setting yaw/pitch + camera position places the explorer)
;(window as unknown as { __roam: typeof roam }).__roam = roam
