import * as THREE from 'three'
import { clamp } from '../lib/random'

export const SUNRISE = 6
export const SUNSET = 19.3
const MAX_ELEV = THREE.MathUtils.degToRad(64)

/** Default sunset azimuth (deg) from the view axis; positive is to the right. */
const SUNSET_AZ_DEFAULT = 26
/**
 * Azimuth ease. f(t) = t − a·sin(2πt)/(2π) with a < 1, so f is strictly increasing,
 * f(0) = 0 and f(1) = 1. Slows the sweep near sunrise and sunset; the extra azimuth
 * falls around midday. 0.68 puts the 18:15→sunset descent at ~50°.
 */
const AZ_A = 0.68

/** `?sunset=` once at startup. Non-browser, missing, or non-numeric → 26. Clamped to [-10, 60]. */
function readSunsetAz(): number {
  try {
    const search = typeof window === 'undefined' ? undefined : window.location?.search
    if (typeof search !== 'string') return SUNSET_AZ_DEFAULT
    const raw = new URLSearchParams(search).get('sunset')
    if (raw == null || raw.trim() === '') return SUNSET_AZ_DEFAULT
    const n = Number(raw)
    if (!Number.isFinite(n)) return SUNSET_AZ_DEFAULT
    return Math.min(60, Math.max(-10, n))
  } catch {
    return SUNSET_AZ_DEFAULT
  }
}

const sunsetAz = readSunsetAz()
/** k = 0: sunriseAz = sunsetAz − 180, so the arc sweeps 180° through the behind side. Default −154, ends −334 ≡ sunsetAz. */
const sunriseAz = sunsetAz - 180

function azFrac(t: number) {
  return t - (AZ_A * Math.sin(2 * Math.PI * t)) / (2 * Math.PI)
}

/** Cloud sunset-window centre (deg): sunset azimuth minus 8. Same `?sunset=` value as the path. */
export function sunsetViewAz() {
  return sunsetAz - 8
}

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
 * Sun path (artistic, not astronomical). Azimuth only:
 *   az = sunriseAz − 180° · f(clamp(dayT, −0.3, 1.3))
 *   f(t) = t − a·sin(2πt)/(2π), a = 0.68
 * Rises behind-left (default sunriseAz = −154°), passes behind the viewer, and
 * sets at sunriseAz − 180° (default −334° ≡ +26°). `?sunset=` moves both ends
 * together and keeps that behind sweep. Night keeps the same clamp.
 * Elevation, golden hour and day/night are unchanged.
 */
export function sunAt(hour: number, out = new THREE.Vector3()): SunState {
  const dayT = (hour - SUNRISE) / (SUNSET - SUNRISE)
  const s = Math.sin(Math.PI * dayT)
  // shaped so golden hour lasts longer near the horizon
  // mornings linger lower (longer golden light), evenings descend steadily
  const shape = dayT < 0.5 ? 2.2 : 1.7
  const elevRad = Math.sign(s) * Math.pow(Math.abs(s), shape) * MAX_ELEV
  const az = THREE.MathUtils.degToRad(sunriseAz - 180 * azFrac(clamp(dayT, -0.3, 1.3)))
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
