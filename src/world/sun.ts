import * as THREE from 'three'
import { clamp } from '../lib/random'

export const SUNRISE = 6
export const SUNSET = 19.3
const MAX_ELEV = THREE.MathUtils.degToRad(64)

export interface SunState {
  /** unit vector pointing towards the sun */
  dir: THREE.Vector3
  /** elevation in degrees (negative = below horizon) */
  elevation: number
  /** 0 at night, 1 in full day */
  day: number
  /** 0..1, strongest near the horizon when sun is up (golden hour) */
  golden: number
  /** 0..1 night amount */
  night: number
}

/**
 * Sun path (artistic, not astronomical): rises behind-left of the default camera so
 * mornings are warm side-light with long shadows across the road, culminates high
 * in front, and sets inside the frame on the right for a backlit golden sunset.
 */
export function sunAt(hour: number, out = new THREE.Vector3()): SunState {
  const dayT = (hour - SUNRISE) / (SUNSET - SUNRISE)
  const s = Math.sin(Math.PI * dayT)
  // shaped so golden hour lasts longer near the horizon
  // mornings linger lower (longer golden light), evenings descend steadily
  const shape = dayT < 0.5 ? 2.2 : 1.7
  const elevRad = Math.sign(s) * Math.pow(Math.abs(s), shape) * MAX_ELEV
  const az = THREE.MathUtils.degToRad(-100 + 126 * clamp(dayT, -0.3, 1.3))
  out.set(Math.sin(az) * Math.cos(elevRad), Math.sin(elevRad), -Math.cos(az) * Math.cos(elevRad)).normalize()
  const elevation = THREE.MathUtils.radToDeg(elevRad)
  const day = clamp((elevation + 6) / 14)
  const golden = elevation > -4 ? clamp(1 - (elevation - 2) / 24) * clamp((elevation + 4) / 5) : 0
  const night = clamp((-elevation - 2) / 10)
  return { dir: out, elevation, day, golden, night }
}

export function timeLabel(hour: number) {
  const h = Math.floor(hour), m = Math.floor((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function phaseName(hour: number) {
  if (hour < 4.5 || hour >= 20.5) return '星夜'
  if (hour < 6.5) return '黎明'
  if (hour < 9.5) return '清晨'
  if (hour < 15.5) return '正午'
  if (hour < 17.5) return '午后'
  if (hour < 19.6) return '黄昏'
  return '暮色'
}
