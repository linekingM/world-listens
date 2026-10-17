/**
 * Rendering quality tiers (高/中/低). The user's choice is persisted; otherwise we auto-pick from the device
 * (mobile / GPU string) and a short fps probe may step it down once per session. `?q=high|medium|low` pins a tier.
 */
export type Quality = 'high' | 'medium' | 'low'
export const QUALITIES: Quality[] = ['high', 'medium', 'low']
export const QUALITY_LABEL: Record<Quality, string> = { high: '高', medium: '中', low: '低' }

export interface QualitySpec {
  /** device pixel ratio range for the canvas */
  dpr: [number, number]
  /** multiplier on the style's shadow map size */
  shadowScale: number
  /** full = god rays + bloom + grain; lite = tone mapping + vignette + SMAA only */
  post: 'full' | 'lite'
  /** all = every tree is an instanced asset tree; near = assets by the avenue, procedural beyond; proc = procedural only */
  trees: 'all' | 'near' | 'proc'
}
export const QSPEC: Record<Quality, QualitySpec> = {
  high: { dpr: [1, 2], shadowScale: 2, post: 'full', trees: 'all' },
  medium: { dpr: [1, 1.5], shadowScale: 1, post: 'full', trees: 'near' },
  low: { dpr: [1, 1], shadowScale: 0.5, post: 'lite', trees: 'proc' },
}

const KEY = 'world-listens.quality'
const AUTO_KEY = 'world-listens.quality.auto'
const isQ = (v: unknown): v is Quality => typeof v === 'string' && (QUALITIES as string[]).includes(v)

function read(key: string): Quality | null {
  try { const v = localStorage.getItem(key); return isQ(v) ? v : null } catch { return null }
}
function write(key: string, v: Quality | null) {
  try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key) } catch { /* private mode / quota */ }
}

/** The GPU's renderer string, if the browser exposes it. */
export function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch { return '' }
}

/** Device-based first guess (before any fps measurement). */
export function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  const gpu = gpuName()
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) return 'low'
  if (mobile) return (nav.deviceMemory ?? 8) <= 3 || (navigator.hardwareConcurrency ?? 8) <= 4 ? 'low' : 'medium'
  // older / entry-level integrated graphics: start at medium, the fps probe can still step down
  if (/intel.*(hd|uhd) graphics( \d{3})?\b|mali|adreno|powervr|apple gpu/i.test(gpu) && !/iris xe|arc/i.test(gpu)) return 'medium'
  return 'high'
}

export interface InitialQuality { quality: Quality; auto: boolean; pinned: boolean }
export function initialQuality(): InitialQuality {
  const q = new URLSearchParams(location.search).get('q')
  if (isQ(q)) return { quality: q, auto: false, pinned: true }
  const user = read(KEY)
  if (user) return { quality: user, auto: false, pinned: false }
  return { quality: read(AUTO_KEY) ?? detectQuality(), auto: true, pinned: false }
}
export function storeUserQuality(q: Quality | null) { write(KEY, q) }
export function storeAutoQuality(q: Quality | null) { write(AUTO_KEY, q) }
