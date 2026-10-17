import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useWorld } from '../../state/worldStore'
import { QUALITY_LABEL, type Quality } from '../../state/quality'

const LOWER: Record<Quality, Quality | null> = { high: 'medium', medium: 'low', low: null }
const WARMUP = 4, WINDOW = 3, MIN_FPS = 28

/**
 * While the tier is automatic: after a short warm-up, measure fps for a few seconds; if it's too slow, step down
 * one tier (and re-measure), at most twice per session. Paused while the tab is hidden.
 */
export function QualityProbe() {
  const st = useRef({ t: 0, frames: 0, steps: 0, done: false })
  useFrame((_, dt) => {
    const p = st.current
    const w = useWorld.getState()
    if (p.done || !w.qualityAuto) return
    if (document.hidden || dt > 0.5) { p.t = 0; p.frames = 0; return }
    p.t += dt
    if (p.t < WARMUP) return
    p.frames++
    if (p.t < WARMUP + WINDOW) return
    const fps = p.frames / (p.t - WARMUP)
    ;(window as unknown as { __qualityFps: number }).__qualityFps = fps
    const next = LOWER[w.quality]
    if (fps < MIN_FPS && next && p.steps < 2) {
      p.steps++
      w.autoQuality(next)
      w.toast(`画面较卡，已自动切换到「${QUALITY_LABEL[next]}」画质（可在 视角 面板调整）`, 'info')
      p.t = 0; p.frames = 0
    } else p.done = true
  })
  return null
}
