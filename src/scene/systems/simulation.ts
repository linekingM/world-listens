/**
 * World-rules simulation. Objects keep their *rest* transform in the store; this
 * module owns a per-object animated offset (position + rotation) driven by the
 * current gravity / orbit / float rules, and springs back to rest when rules are
 * restored. It is intentionally not a rigid-body engine — just readable,
 * controllable motion that always responds to the user's settings.
 */
import * as THREE from 'three'
import type { WorldObject } from '../../state/types'
import { OBJECT_KINDS } from '../../world/objects'

export interface Sim {
  off: THREE.Vector3
  vel: THREE.Vector3
  rot: THREE.Vector3
  rotVel: THREE.Vector3
  orbit: number
  phase: number
  spin: THREE.Vector3
}

export const sims = new Map<string, Sim>()
export const orbitCenter = new THREE.Vector3(-4, 0, -60)

let seed = 1
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

export function getSim(id: string): Sim {
  let s = sims.get(id)
  if (!s) {
    s = {
      off: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(), rotVel: new THREE.Vector3(), orbit: 0,
      phase: rand() * Math.PI * 2, spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    }
    sims.set(id, s)
  }
  return s
}

const tmp = new THREE.Vector3()

/** Advance one object's simulation. `g` is the smoothed gravity (1 normal … -1 reversed). */
export function stepSim(o: WorldObject, s: Sim, g: number, orbitOn: boolean, t: number, dt: number) {
  const k = OBJECT_KINDS[o.type]
  const w = 1 - g // 0 normal, 1 weightless, 2 reversed
  const L = k.lightness
  // target lift above rest
  let target = 0
  if (w > 0.02) {
    target = w * (1.5 + 5 * L) + Math.sin(t * (0.6 + L * 0.5) + s.phase) * Math.min(w, 1) * (0.5 + L * 0.6)
    if (g < 0) target += -g * (22 + 26 * L) // reversed: rise high, then hover
  }
  if (o.floating) target = Math.max(target, 9 + 3 * L + Math.sin(t * 0.8 + s.phase) * 0.8)
  // spring (heavier objects respond more slowly)
  const stiff = 1.2 + L * 2.4
  s.vel.y += ((target - s.off.y) * stiff - s.vel.y * (1.6 + L)) * dt
  s.off.y += s.vel.y * dt
  if (!k.airborne && s.off.y < 0) {
    s.off.y = 0
    if (s.vel.y < -0.5) s.vel.y *= -0.25 // soft landing bounce
    else s.vel.y = 0
  }
  // rotation: tumble when weightless, settle when grounded
  const free = Math.min(1, Math.max(0, w) + (o.floating ? 0.6 : 0))
  const tumbleTarget = free * k.tumble
  s.rotVel.x += ((s.spin.x * tumbleTarget * 0.6) - s.rotVel.x) * dt * 1.5
  s.rotVel.z += ((s.spin.z * tumbleTarget * 0.6) - s.rotVel.z) * dt * 1.5
  s.rotVel.y += ((s.spin.y * free * 0.35) - s.rotVel.y) * dt * 1.5
  s.rot.addScaledVector(s.rotVel, dt)
  // gentle sway for upright things; spring back to rest when gravity returns
  const settle = (1 - free) * 2.2
  s.rot.x -= s.rot.x * settle * dt
  s.rot.z -= s.rot.z * settle * dt
  s.rot.y -= s.rot.y * settle * 0.6 * dt
  if (k.tumble < 0.3) {
    // upright objects never flip: clamp tilt
    s.rot.x = THREE.MathUtils.clamp(s.rot.x, -0.25, 0.25)
    s.rot.z = THREE.MathUtils.clamp(s.rot.z, -0.25, 0.25)
  }
  // orbit around the chosen centre
  if (orbitOn) {
    tmp.set(o.pos[0] - orbitCenter.x, 0, o.pos[2] - orbitCenter.z)
    const r = Math.max(4, tmp.length())
    s.orbit += dt * (6 / r) * (0.6 + L * 0.4)
  } else {
    // unwind to the nearest full turn so objects glide home
    const home = Math.round(s.orbit / (Math.PI * 2)) * Math.PI * 2
    s.orbit += (home - s.orbit) * (1 - Math.exp(-dt * 2.2))
  }
  if (orbitOn || Math.abs(s.orbit % (Math.PI * 2)) > 1e-3) {
    tmp.set(o.pos[0] - orbitCenter.x, 0, o.pos[2] - orbitCenter.z)
    const c = Math.cos(s.orbit), sn = Math.sin(s.orbit)
    s.off.x = tmp.x * c - tmp.z * sn - tmp.x
    s.off.z = tmp.x * sn + tmp.z * c - tmp.z
  } else {
    s.off.x = 0
    s.off.z = 0
  }
}

;(window as unknown as { __sims: typeof sims }).__sims = sims
