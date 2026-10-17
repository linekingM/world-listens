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
 * Sun path (artistic, not astronomical). Sunrise azimuth stays -100°
 * (behind-left of the default camera). Travel is reversed so the sun passes
 * behind and above the viewer and the hero view stays front-lit. Angle from
 * the view axis (0° dead backlight, 90° side, 180° front-lit): ~146° at 09:00,
 * ~168° at noon, ~121° at 15:00, ~83° at 17:30, ~64° at 18:45, and ~55° at
 * sunset — on the right, a modest turn from the hero frame.
 * Elevation, golden hour and day/night are unchanged.
 */
export function sunAt(hour: number, out = new THREE.Vector3()): SunState {
  const dayT = (hour - SUNRISE) / (SUNSET - SUNRISE)
  const s = Math.sin(Math.PI * dayT)
  // shaped so golden hour lasts longer near the horizon
  // mornings linger lower (longer golden light), evenings descend steadily
  const shape = dayT < 0.5 ? 2.2 : 1.7
  const elevRad = Math.sign(s) * Math.pow(Math.abs(s), shape) * MAX_ELEV
  const az = THREE.MathUtils.degToRad(-100 - 205 * clamp(dayT, -0.3, 1.3))
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
  if (hour < 8.5) return '清晨'
  if (hour < 11) return '上午'
  if (hour < 13.5) return '正午'
  if (hour < 17) return '午后'
  if (hour < 19.6) return '黄昏'
  return '暮色'
}
