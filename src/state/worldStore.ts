import { create } from 'zustand'
import type { CloudObject, ObjType, Panel, Vec3, WeatherId, WorldDoc, WorldObject } from './types'
import { defaultWorld } from './defaultWorld'
import { sims } from '../scene/systems/simulation'

export type StyleId = 'a' | 'b' | 'c'
export type { ObjType, WeatherId, WorldDoc, WorldObject, CloudObject, Panel, Vec3 }

const params = new URLSearchParams(window.location.search)
const initialStyle = (['a', 'b', 'c'].includes(params.get('style') ?? '') ? params.get('style') : 'a') as StyleId
const tParam = params.get('t')

export interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'error'; action?: { label: string; run: () => void } }

interface UIState {
  style: StyleId
  selectedId: string | null
  placing: ObjType | null
  panel: Panel
  railOpen: boolean
  /** true while the user drags an object / cloud / the sun → camera controls pause */
  dragging: boolean
  /** how fast the visible time chases the target: 'drag' = snappy, 'slow' = cinematic transition */
  timeEase: 'drag' | 'slow'
  cameraResetTick: number
  /** 'orbit' = framed orbit around the scene, 'roam' = game-style free explore (WASD / joystick) */
  camMode: 'orbit' | 'roam'
  toasts: Toast[]
  hintSeen: boolean
}

interface Actions {
  setCamMode: (m: 'orbit' | 'roam') => void
  setStyle: (s: StyleId) => void
  setTime: (t: number, ease?: 'drag' | 'slow') => void
  setWeather: (w: WeatherId) => void
  setName: (n: string) => void
  addObject: (type: ObjType, pos: Vec3, extra?: Partial<WorldObject>) => string
  updateObject: (id: string, patch: Partial<WorldObject>) => void
  removeObject: (id: string) => void
  select: (id: string | null) => void
  setPlacing: (t: ObjType | null) => void
  moveCloud: (id: string, pos: Vec3) => void
  cloudToIsland: (id: string) => string | null
  setGravity: (g: number) => void
  setOrbit: (o: boolean) => void
  toggleFloat: (id: string) => void
  restoreRules: () => void
  setPanel: (p: Panel) => void
  togglePanel: (p: Exclude<Panel, null>) => void
  setRailOpen: (o: boolean) => void
  setDragging: (d: boolean) => void
  requestCameraReset: () => void
  loadDoc: (doc: WorldDoc) => void
  resetWorld: () => void
  getDoc: () => WorldDoc
  toast: (text: string, kind?: Toast['kind'], action?: Toast['action']) => void
  /** delete with an undo toast */
  deleteWithUndo: (id: string) => void
  dismissToast: (id: number) => void
  setHintSeen: () => void
}

export type WorldState = WorldDoc & UIState & Actions

let uid = 0
const newId = (p: string) => `${p}-${Date.now().toString(36)}${(uid++).toString(36)}`
let toastId = 0
const wrap24 = (t: number) => ((t % 24) + 24) % 24
/** bumped on load/reset so a pending 撤销 can never reinsert into a different world */
let epoch = 0
const OBJECT_CAP = 400

const base = defaultWorld()
if (tParam !== null && Number.isFinite(Number(tParam))) base.time = wrap24(Number(tParam))

export const useWorld = create<WorldState>((set, get) => ({
  ...base,
  style: initialStyle,
  selectedId: null,
  placing: null,
  panel: null,
  railOpen: true,
  dragging: false,
  timeEase: 'drag',
  cameraResetTick: 0,
  camMode: 'orbit',
  toasts: [],
  hintSeen: (() => { try { return localStorage.getItem('world-listens.hint') === '1' } catch { return false } })(),

  setStyle: (style) => set({ style }),
  setTime: (time, ease = 'drag') => { if (Number.isFinite(time)) set({ time: wrap24(time), timeEase: ease }) },
  setWeather: (weather) => {
    const t = get().time
    if (weather === 'sunset') set({ weather, time: 18.6, timeEase: 'slow' })
    else if (weather === 'starry') set({ weather, time: t > 20.5 || t < 4 ? t : 22.5, timeEase: 'slow' })
    else if (t > 20 || t < 5) set({ weather, time: 9, timeEase: 'slow' })
    else set({ weather })
  },
  setName: (name) => set({ name: name.slice(0, 40) }),

  addObject: (type, pos, extra) => {
    if (get().objects.length >= OBJECT_CAP) { get().toast('场景物件已达上限（400）', 'info'); return '' }
    const id = newId(type)
    const obj: WorldObject = { id, type, pos, rotY: Math.random() * Math.PI * 2, scale: 1, variant: Math.floor(Math.random() * 3), ...extra }
    set((s) => ({ objects: [...s.objects, obj], selectedId: id }))
    return id
  },
  updateObject: (id, patch) => set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
  removeObject: (id) => set((s) => ({ objects: s.objects.filter((o) => o.id !== id), selectedId: s.selectedId === id ? null : s.selectedId })),
  select: (selectedId) => set({ selectedId }),
  setPlacing: (placing) => set({ placing, selectedId: placing ? null : get().selectedId }),
  moveCloud: (id, pos) => set((s) => ({ clouds: s.clouds.map((c) => (c.id === id ? { ...c, pos } : c)) })),
  cloudToIsland: (id) => {
    const c = get().clouds.find((x) => x.id === id)
    if (!c) return null
    if (get().objects.length >= OBJECT_CAP) { get().toast('场景物件已达上限（400）', 'info'); return null }
    const islandId = newId('island')
    const obj: WorldObject = { id: islandId, type: 'island', pos: [c.pos[0], Math.max(18, c.pos[1] * 0.75), c.pos[2]], rotY: Math.random() * 6.28, scale: 0.7 + c.scale * 0.25, variant: 3 + (c.seed % 3) }
    set((s) => ({ clouds: s.clouds.filter((x) => x.id !== id), objects: [...s.objects, obj], selectedId: islandId }))
    return islandId
  },
  setGravity: (gravity) => set({ gravity: Math.max(-1, Math.min(1, gravity)) }),
  setOrbit: (orbit) => set({ orbit }),
  toggleFloat: (id) => set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, floating: !o.floating || undefined } : o)) })),
  restoreRules: () => set((s) => ({ gravity: 1, orbit: false, objects: s.objects.map((o) => (o.floating ? { ...o, floating: undefined } : o)) })),

  setPanel: (panel) => set({ panel, placing: panel === null || panel === 'add' ? get().placing : null }),
  togglePanel: (p) => set((s) => ({ panel: s.panel === p ? null : p, placing: null })),
  setRailOpen: (railOpen) => set({ railOpen, panel: railOpen ? get().panel : null }),
  setDragging: (dragging) => set({ dragging }),
  requestCameraReset: () => set((s) => ({ cameraResetTick: s.cameraResetTick + 1, camMode: 'orbit' })),
  setCamMode: (camMode) => set({ camMode, panel: null, placing: null }),

  // a new world: drop per-object sim offsets (ids like bench-0 are reused) and stale 撤销 toasts
  loadDoc: (doc) => { epoch++; sims.clear(); set((s) => ({ ...doc, selectedId: null, placing: null, panel: s.panel === 'save' ? 'save' : null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1, camMode: 'orbit', toasts: s.toasts.filter((t) => !t.action) })) },
  resetWorld: () => { epoch++; sims.clear(); set((s) => ({ ...defaultWorld(), selectedId: null, placing: null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1, camMode: 'orbit', toasts: s.toasts.filter((t) => !t.action) })) },
  getDoc: () => {
    const s = get()
    return { v: 1, name: s.name, time: s.time, weather: s.weather, gravity: s.gravity, orbit: s.orbit, objects: s.objects, clouds: s.clouds }
  },
  toast: (text, kind = 'info', action) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, kind, action }] }))
    setTimeout(() => get().dismissToast(id), action ? 5200 : 3200)
  },
  deleteWithUndo: (id) => {
    const s = get()
    const idx = s.objects.findIndex((o) => o.id === id)
    if (idx < 0) return
    const obj = s.objects[idx]
    const gen = epoch
    s.removeObject(id)
    const label = ({ tree: '树木', pine: '松树', rock: '岩石', house: '小屋', tower: '塔楼', bench: '长椅', lamp: '路灯', island: '浮岛' } as const)[obj.type]
    get().toast(`已删除${label}`, 'info', { label: '撤销', run: () => {
      if (gen !== epoch) return
      set((st) => {
        if (st.objects.some((o) => o.id === obj.id)) return {}
        const at = Math.min(idx, st.objects.length)
        return { objects: [...st.objects.slice(0, at), obj, ...st.objects.slice(at)], selectedId: obj.id }
      })
    } })
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setHintSeen: () => { try { localStorage.setItem('world-listens.hint', '1') } catch { /* private mode / quota */ } set({ hintSeen: true }) },
}))

// test/debug hook (harmless in production: read-only access to the store API)
;(window as unknown as { __world: typeof useWorld }).__world = useWorld
