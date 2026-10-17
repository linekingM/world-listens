/**
 * Physically-ish sun disc warmth. Dawn ≠ dusk:
 * soft rose/gold near sunrise → white most of day (incl. afternoon) →
 * amber→orange-red only late near sunset.
 */
export function physicalSunWarmth(elevationDeg: number, hour = 12): number {
  const h = ((hour % 24) + 24) % 24
  const morning = h < 12

  // High sun: always white
  if (elevationDeg >= 14) return 0

  if (morning) {
    // Dawn: soft, fades to white by ~10–12° elev (earlier than dusk)
    if (elevationDeg >= 10) return 0
    if (elevationDeg >= 4) return ((10 - elevationDeg) / 6) * 0.22 // soft gold max ~0.22
    if (elevationDeg >= -1) return 0.22 + ((4 - elevationDeg) / 5) * 0.2 // rose-gold ~0.42
    if (elevationDeg >= -4) return 0.42 * (1 - (-1 - elevationDeg) / 3)
    return 0
  }

  // Evening: stay pale until low; warm hard only last stretch
  if (elevationDeg >= 10) return 0 // 15:00 / 17:00-ish still white if elev high enough
  if (elevationDeg >= 6) return ((10 - elevationDeg) / 4) * 0.1 // tiny hint
  if (elevationDeg >= 3) return 0.1 + ((6 - elevationDeg) / 3) * 0.28 // → ~0.38 amber
  if (elevationDeg >= 0) return 0.38 + ((3 - elevationDeg) / 3) * 0.37 // → ~0.75 orange
  if (elevationDeg >= -3) return 0.75 + (-elevationDeg) / 3 * 0.25 // → 1.0 red
  return Math.max(0, 1 - (-elevationDeg - 3) / 6)
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
