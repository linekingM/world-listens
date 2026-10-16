/**
 * Hidden combos ("彩蛋"): certain combinations of time, weather and world rules
 * unlock a special effect and a one-time discovery toast. Discoveries persist locally.
 */
import { useWorld, type WorldState } from './worldStore'
import { sunAt } from '../world/sun'

export interface Surprise { id: string; name: string; text: string; test: (s: WorldState) => boolean }

const isNight = (t: number) => sunAt(t).elevation < -6
export const SURPRISES: Surprise[] = [
  { id: 'meteors', name: '流星雨', text: '失重的夜空下，星星开始坠落', test: (s) => isNight(s.time) && s.gravity <= 0.15 && s.weather !== 'cloudy' },
  { id: 'carousel', name: '黄昏旋转木马', text: '万物在金色的光里缓缓公转', test: (s) => s.orbit && sunAt(s.time).golden > 0.45 && sunAt(s.time).elevation > -2 },
  { id: 'archipelago', name: '天空群岛', text: '五座浮岛连成了天空中的群岛', test: (s) => s.objects.filter((o) => o.type === 'island').length >= 5 },
  { id: 'lanterns', name: '雾中灯火', text: '薄雾里的路灯晕开了暖光', test: (s) => s.weather === 'mist' && sunAt(s.time).elevation < 0 },
  { id: 'fireflies', name: '萤火之夜', text: '晴朗的夜里，草丛中亮起了萤火虫', test: (s) => isNight(s.time) && s.weather !== 'cloudy' && s.weather !== 'mist' && s.gravity > 0.8 },
]

const KEY = 'world-listens.surprises'
const found = new Set<string>((() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as string[] } catch { return [] } })())
/** currently active combo ids (read each frame by effects) */
export const activeSurprises = new Set<string>()

export function discoveredCount() { return found.size }

let started = false
export function startSurprises() {
  if (started) return
  started = true
  let timer = 0
  const check = () => {
    const s = useWorld.getState()
    for (const sp of SURPRISES) {
      const on = sp.test(s)
      if (on) activeSurprises.add(sp.id); else activeSurprises.delete(sp.id)
      if (on && !found.has(sp.id)) {
        found.add(sp.id)
        localStorage.setItem(KEY, JSON.stringify([...found]))
        s.toast(`✦ 发现彩蛋「${sp.name}」· ${sp.text}（${found.size}/${SURPRISES.length}）`, 'ok')
      }
    }
  }
  // debounce so dragging the dial through a combo does not spam
  useWorld.subscribe(() => { clearTimeout(timer); timer = window.setTimeout(check, 700) })
  check()
  ;(window as unknown as { __surprises: unknown }).__surprises = { activeSurprises, found }
}
