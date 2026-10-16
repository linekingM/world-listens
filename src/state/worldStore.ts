import { create } from 'zustand'

export type StyleId = 'a' | 'b' | 'c'

const params = new URLSearchParams(window.location.search)
const initialStyle = (['a', 'b', 'c'].includes(params.get('style') ?? '') ? params.get('style') : 'a') as StyleId
const tParam = Number(params.get('t'))
const initialTime = Number.isFinite(tParam) && params.get('t') !== null ? tParam : 8

interface WorldState {
  /** Hour of day, 0..24 (continuous). */
  time: number
  style: StyleId
  setTime: (t: number) => void
  setStyle: (s: StyleId) => void
}

export const useWorld = create<WorldState>((set) => ({
  time: initialTime,
  style: initialStyle,
  setTime: (time) => set({ time: ((time % 24) + 24) % 24 }),
  setStyle: (style) => {
    const url = new URL(window.location.href)
    url.searchParams.set('style', style)
    window.history.replaceState(null, '', url)
    set({ style })
  },
}))
