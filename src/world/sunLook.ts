import { smoothstep } from '../lib/random'

/**
 * Disc warmth from elevation only, so dawn mirrors dusk.
 * Near white above ~20°, smooth ease-in (flat at the white end),
 * 0.65 at 9.24°, full at 3.73°, held through sunset until just below
 * the horizon, then the same night fade as before (1 at −3°, 0 at −9°).
 * `_hour` stays in the signature for callers; it does not skew dawn vs dusk.
 */
const WARM_HI = 24
const WARM_LO = 3.73
const WARM_AT = 9.24
const warmU = (WARM_HI - WARM_AT) / (WARM_HI - WARM_LO)
const warmS = warmU * warmU * (3 - 2 * warmU)
const WARM_K = Math.log(0.65) / Math.log(warmS)

export function physicalSunWarmth(elevationDeg: number, _hour = 12): number {
  if (elevationDeg <= -3) return Math.max(0, 1 - (-elevationDeg - 3) / 6)
  if (elevationDeg <= WARM_LO) return 1
  if (elevationDeg >= WARM_HI) return 0
  const u = (WARM_HI - elevationDeg) / (WARM_HI - WARM_LO)
  const s = u * u * (3 - 2 * u)
  return Math.pow(s, WARM_K)
}

/** Disc dimming from air path. ~1 high in the sky, ~0.65 on the horizon. */
export function sunDiscExtinction(elevationDeg: number): number {
  const t = smoothstep(0, 22, Math.max(0, elevationDeg))
  return 0.65 + 0.35 * t
}

/**
 * Brief cloud afterglow. Rises around +4°, peaks near 0…−1°, gone by ~−6°.
 * Same elevation window at dawn, a little weaker.
 */
export function cloudAfterglow(elevationDeg: number, hour = 18): number {
  const rise = smoothstep(7.2, -0.4, elevationDeg)
  const fall = smoothstep(-6, -0.6, elevationDeg)
  const h = ((hour % 24) + 24) % 24
  return rise * fall * (h < 12 ? 0.72 : 1)
}

const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
]

/** Gold as the glow starts, orange-pink at the peak, grey-blue as it dies. */
export function afterglowRgb(elevationDeg: number): [number, number, number] {
  const gold: [number, number, number] = [1, 0.694, 0.353]
  const pink: [number, number, number] = [1, 0.478, 0.408]
  const dusk: [number, number, number] = [0.494, 0.541, 0.671]
  const rose = smoothstep(3, -1.2, elevationDeg)
  const blue = smoothstep(-1.2, -5.2, elevationDeg)
  return lerp3(lerp3(gold, pink, rose), dusk, blue)
}

/** warm RGB: 0=pale white, low=rose/gold, high=orange-red */
export function warmthToRgb(w: number, hueShift = 0): [number, number, number] {
  const t = Math.min(1, Math.max(0, w))
  // dawn-friendly low stops lean slightly rose; high stops orange-red
  const stops: [number, number, number, number][] = [
    [0, 1.0, 0.98, 0.95],
    [0.2, 1.0, 0.9, 0.82],   // soft gold / light rose
    [0.4, 1.0, 0.72, 0.48],
    [0.65, 1.0, 0.45, 0.14],
    [0.85, 1.0, 0.26, 0.05],
    [1.0, 0.92, 0.12, 0.03],
  ]
  let a = stops[0], b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break }
  }
  const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0])
  let r = a[1] + (b[1] - a[1]) * u
  let g = a[2] + (b[2] - a[2]) * u
  let bl = a[3] + (b[3] - a[3]) * u
  const hs = Math.min(30, Math.max(-30, hueShift)) / 30
  g = Math.min(1, Math.max(0, g - hs * 0.06 * t))
  bl = Math.min(1, Math.max(0, bl + hs * 0.04 * t))
  return [r, g, bl]
}

export type SunLookMode = 'auto' | 'manual'

export interface SunLook {
  mode: SunLookMode
  warmth: number
  hue: number
}

export const DEFAULT_SUN_LOOK: SunLook = { mode: 'auto', warmth: 0, hue: 0 }

export function clampSunLook(raw: Partial<SunLook> | null | undefined): SunLook {
  const mode = raw?.mode === 'manual' ? 'manual' : 'auto'
  const warmth = typeof raw?.warmth === 'number' && Number.isFinite(raw.warmth) ? Math.min(1, Math.max(0, raw.warmth)) : 0
  const hue = typeof raw?.hue === 'number' && Number.isFinite(raw.hue) ? Math.min(30, Math.max(-30, raw.hue)) : 0
  return { mode, warmth, hue }
}

export function effectiveWarmth(look: SunLook, elevationDeg: number, hour = 12): number {
  return look.mode === 'manual' ? look.warmth : physicalSunWarmth(elevationDeg, hour)
}
