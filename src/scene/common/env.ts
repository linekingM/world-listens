import * as THREE from 'three'
import { createLighting, type Lighting } from '../../world/palette'
import { sunAt, type SunState } from '../../world/sun'

/**
 * Per-frame environment shared by everything that reacts to time of day.
 * Mutated in place by <SunRig/> once per frame so shaders/lights can read it
 * without causing React re-renders.
 */
export interface Env {
  time: number
  sun: SunState
  light: Lighting
}

export function createEnv(time: number): Env {
  return { time, sun: sunAt(time, new THREE.Vector3()), light: createLighting() }
}
