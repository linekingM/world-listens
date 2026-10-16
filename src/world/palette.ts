import * as THREE from 'three'

/** One lighting keyframe, indexed by sun elevation in degrees. */
export interface LightKey {
  elev: number
  sun: string
  sunI: number
  skyTop: string
  skyHorizon: string
  hemiSky: string
  hemiGround: string
  hemiI: number
  fog: string
}

export interface Lighting {
  sun: THREE.Color
  sunI: number
  skyTop: THREE.Color
  skyHorizon: THREE.Color
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiI: number
  fog: THREE.Color
}

const tmpA = new THREE.Color(), tmpB = new THREE.Color()
const mix = (out: THREE.Color, a: string, b: string, t: number) => out.copy(tmpA.set(a)).lerp(tmpB.set(b), t)

export function createLighting(): Lighting {
  return {
    sun: new THREE.Color(), sunI: 0, skyTop: new THREE.Color(), skyHorizon: new THREE.Color(),
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiI: 0, fog: new THREE.Color(),
  }
}

/** Interpolate a palette (keys sorted by ascending elevation). */
export function sampleLighting(keys: LightKey[], elev: number, out: Lighting): Lighting {
  let i = 0
  while (i < keys.length - 2 && elev > keys[i + 1].elev) i++
  const a = keys[i], b = keys[i + 1]
  const t = THREE.MathUtils.clamp((elev - a.elev) / (b.elev - a.elev), 0, 1)
  const s = t * t * (3 - 2 * t)
  mix(out.sun, a.sun, b.sun, s)
  out.sunI = THREE.MathUtils.lerp(a.sunI, b.sunI, s)
  mix(out.skyTop, a.skyTop, b.skyTop, s)
  mix(out.skyHorizon, a.skyHorizon, b.skyHorizon, s)
  mix(out.hemiSky, a.hemiSky, b.hemiSky, s)
  mix(out.hemiGround, a.hemiGround, b.hemiGround, s)
  out.hemiI = THREE.MathUtils.lerp(a.hemiI, b.hemiI, s)
  mix(out.fog, a.fog, b.fog, s)
  return out
}
