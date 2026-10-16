import * as THREE from 'three'
import { createLighting, type Lighting } from '../../world/palette'
import { sunAt, type SunState } from '../../world/sun'
import type { WeatherId } from '../../state/types'

export interface WeatherMix {
  /** 0 clear … 1 overcast */
  cover: number
  /** 0 … 1 mist */
  mist: number
}

export const WEATHER_TARGETS: Record<WeatherId, WeatherMix> = {
  clear: { cover: 0.22, mist: 0 },
  cloudy: { cover: 0.92, mist: 0.12 },
  mist: { cover: 0.4, mist: 1 },
  sunset: { cover: 0.32, mist: 0.04 },
  starry: { cover: 0.04, mist: 0 },
}

/**
 * Per-frame environment shared by everything that reacts to time / weather / rules.
 * Mutated in place by <SunRig/> once per frame so shaders and lights can read it
 * without React re-renders.
 */
export interface Env {
  time: number
  sun: SunState
  light: Lighting
  weather: WeatherMix
  /** smoothed gravity (1 normal, 0 weightless, -1 reversed) */
  gravity: number
}

export function createEnv(time: number): Env {
  return { time, sun: sunAt(time, new THREE.Vector3()), light: createLighting(), weather: { ...WEATHER_TARGETS.clear }, gravity: 1 }
}

/** Uniforms shared by all patched materials (wind, glints…). */
export const fxUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uSunView: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uGlint: { value: 0 },
  uCloudShadow: { value: 0.3 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
}
