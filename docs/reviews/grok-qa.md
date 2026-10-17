# QA report — 如果世界听你的

Independent hunt on the disposable worktree `/workspace/wl-qa` (unfixed production preview at `http://127.0.0.1:4174`). `/workspace/world-listens` was not modified. Port 4173 was not used. The full `tests/interactions.mjs` suite was not run.

The patches below are already applied in this worktree. `npx tsc -b` exited 0 after them. The fixed bundle was **not** rebuilt or re-probed before the session stopped, so browser confirmation is of the unfixed build only.

## Findings

### 1. A non-array surprises blob white-screens the app — severity high, confidence high

- File(s)/lines: `src/state/surprises.ts` lines 19–20 (module init, before React renders)

- Repro: `localStorage.setItem('world-listens.surprises', '{}')`, then open `/?fresh`.
  - Observed: `pageerror: object is not iterable (cannot read property Symbol(Symbol.iterator))`. `window.__world` never appears.
  - Expected: the app mounts; a bad or old discoveries value is treated as “nothing discovered”.

- Root cause: `JSON.parse('{}')` succeeds, and the `try` only wraps that parse. `new Set({})` throws because a plain object is not iterable. `null` happens to be fine (`new Set(null)` is empty). The same `setItem` later in `check` is outside a `try`, so a quota error skips the discovery toast and surfaces as an unhandled timer error.

```diff
--- a/src/state/surprises.ts
+++ b/src/state/surprises.ts
@@ -17,7 +17,14 @@ export const SURPRISES: Surprise[] = [
 ]
 
 const KEY = 'world-listens.surprises'
-const found = new Set<string>((() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as string[] } catch { return [] } })())
+function loadFound(): string[] {
+  try {
+    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
+    if (!Array.isArray(raw)) return []
+    return raw.filter((x): x is string => typeof x === 'string')
+  } catch { return [] }
+}
+const found = new Set<string>(loadFound())
@@ -35,7 +42,7 @@ export function startSurprises() {
       if (on) activeSurprises.add(sp.id); else activeSurprises.delete(sp.id)
       if (on && !found.has(sp.id)) {
         found.add(sp.id)
-        localStorage.setItem(KEY, JSON.stringify([...found]))
+        try { localStorage.setItem(KEY, JSON.stringify([...found])) } catch { /* quota / private mode */ }
         s.toast(`✦ 发现彩蛋「${sp.name}」· ${sp.text}（${found.size}/${SURPRISES.length}）`, 'ok')
       }
```

### 2. Throwing localStorage crashes startup and traps the hint — severity high, confidence high

- File(s)/lines: `src/state/worldStore.ts` line 80 (`hintSeen` at store creation) and line 144 (`setHintSeen`)

- Repro: stub `Storage.prototype.getItem` / `setItem` to throw on keys starting with `world-listens`, then open `/?fresh` with no hint flag.
  - Observed: page error text `startup crashed: blocked`. No store, no UI.
  - Expected: the store mounts and the hint is shown. Clicking “知道了” (`[data-testid=hint-ok]`) hides the hint even when `setItem` throws, with no uncaught `SecurityError` / `QuotaExceededError`.

- Root cause: `hintSeen` calls `localStorage.getItem` while the zustand store is being created. A throw there aborts module init. `setHintSeen` writes storage before `set({ hintSeen: true })`, so a throw also skips the dismiss.

```diff
--- a/src/state/worldStore.ts
+++ b/src/state/worldStore.ts
@@ -77,7 +77,7 @@ export const useWorld = create<WorldState>((set, get) => ({
   timeEase: 'drag',
   cameraResetTick: 0,
   toasts: [],
-  hintSeen: localStorage.getItem('world-listens.hint') === '1',
+  hintSeen: (() => { try { return localStorage.getItem('world-listens.hint') === '1' } catch { return false } })(),
@@ -141,7 +141,9 @@ export const useWorld = create<WorldState>((set, get) => ({
   },
   dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
-  setHintSeen: () => { localStorage.setItem('world-listens.hint', '1'); set({ hintSeen: true }) },
+  setHintSeen: () => {
+    try { localStorage.setItem('world-listens.hint', '1') } catch { /* private mode / quota */ }
+    set({ hintSeen: true })
+  },
```

### 3. Undo after reset/load inserts a second object with the same id — severity high, confidence high

- File(s)/lines: `src/state/worldStore.ts` `deleteWithUndo` lines 134–141, `loadDoc` / `resetWorld` lines 123–124

- Repro: `deleteWithUndo('bench-0')`, run the toast’s `撤销` action (bench returns, count 1). Delete again, keep that action, call `resetWorld()`, then run the saved action.
  - Observed: `{before:1, mid:false, restored:1, after:2, unique:false, n:11}`. Two `bench-0` rows. Later `updateObject` / `removeObject` hit both.
  - Expected: plain undo still restores one bench. After reset, the old 撤销 is a no-op (or gone) and the default world still has exactly one `bench-0`.

- Root cause: the undo closure captures the object and the old index and splices it back with no check that the world has since been replaced. Default ids (`bench-0`, …) are reused by `defaultWorld()`, so the insert collides. The toast also stays in the list across reset (toasts are not cleared).

```diff
--- a/src/state/worldStore.ts
+++ b/src/state/worldStore.ts
@@ -62,6 +62,8 @@ export type WorldState = WorldDoc & UIState & Actions
 let uid = 0
 const newId = (p: string) => `${p}-${Date.now().toString(36)}${(uid++).toString(36)}`
 let toastId = 0
+/** Bumped on load/reset so a pending 撤销 cannot reinsert into a different world. */
+let epoch = 0
 
@@ -120,8 +122,14 @@ export const useWorld = create<WorldState>((set, get) => ({
   requestCameraReset: () => set((s) => ({ cameraResetTick: s.cameraResetTick + 1 })),
 
-  loadDoc: (doc) => set((s) => ({ ...doc, selectedId: null, placing: null, panel: s.panel === 'save' ? 'save' : null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1 })),
-  resetWorld: () => set((s) => ({ ...defaultWorld(), selectedId: null, placing: null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1 })),
+  loadDoc: (doc) => {
+    epoch++
+    set((s) => ({ ...doc, selectedId: null, placing: null, panel: s.panel === 'save' ? 'save' : null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1, toasts: [] }))
+  },
+  resetWorld: () => {
+    epoch++
+    set((s) => ({ ...defaultWorld(), selectedId: null, placing: null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1, toasts: [] }))
+  },
@@ -136,9 +148,16 @@ export const useWorld = create<WorldState>((set, get) => ({
     const idx = s.objects.findIndex((o) => o.id === id)
     if (idx < 0) return
     const obj = s.objects[idx]
+    const gen = epoch
     s.removeObject(id)
     const label = ({ tree: '树木', pine: '松树', rock: '岩石', house: '小屋', tower: '塔楼', bench: '长椅', lamp: '路灯', island: '浮岛' } as const)[obj.type]
-    get().toast(`已删除${label}`, 'info', { label: '撤销', run: () => set((st) => ({ objects: [...st.objects.slice(0, idx), obj, ...st.objects.slice(idx)], selectedId: obj.id })) })
+    get().toast(`已删除${label}`, 'info', { label: '撤销', run: () => {
+      if (gen !== epoch) return
+      set((st) => {
+        if (st.objects.some((o) => o.id === obj.id)) return {}
+        const at = Math.min(idx, st.objects.length)
+        return { objects: [...st.objects.slice(0, at), obj, ...st.objects.slice(at)], selectedId: obj.id }
+      })
+    } })
```

Apply this together with finding 4: both edits replace `loadDoc` / `resetWorld`. The merged bodies need `epoch++`, `sims.clear()`, and `toasts: []`.

### 4. Gravity/orbit offsets survive reset because sim state is keyed by reused ids — severity medium, confidence high

- File(s)/lines: `src/scene/systems/simulation.ts` line 22 (`export const sims`); `src/state/worldStore.ts` `loadDoc` / `resetWorld` lines 123–124. Callers already `sims.delete` on a single delete (`Feedback.tsx`, `SelectionActions.tsx`); reset/load never clear the map.

- Repro: wait until `window.__sims.size > 0`, set every sim’s `off.y = 40`, `off.x = 12`, `orbit = 2.5`, then `resetWorld()` and read the map in the same turn.
  - Observed: `{size: 10, y: 40}` for `bench-0`. The next frame reuses that offset on the new bench with the same id, so it spawns 40 units up.
  - Expected: `sims.size === 0` immediately after reset/load. Fresh `getSim` calls start at the origin.

- Root cause: `getSim` never drops an entry except an explicit `sims.delete(id)`. `resetWorld` / `loadDoc` replace the document but leave the map. Seed ids match, so the old offset is applied to the new object.

```diff
--- a/src/state/worldStore.ts
+++ b/src/state/worldStore.ts
@@ -1,6 +1,7 @@
 import { create } from 'zustand'
 import type { CloudObject, ObjType, Panel, Vec3, WeatherId, WorldDoc, WorldObject } from './types'
 import { defaultWorld } from './defaultWorld'
+import { sims } from '../scene/systems/simulation'
@@ -120,8 +121,10 @@ export const useWorld = create<WorldState>((set, get) => ({
   requestCameraReset: () => set((s) => ({ cameraResetTick: s.cameraResetTick + 1 })),
 
-  loadDoc: (doc) => set((s) => ({ ...doc, selectedId: null, placing: null, panel: s.panel === 'save' ? 'save' : null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1 })),
-  resetWorld: () => set((s) => ({ ...defaultWorld(), selectedId: null, placing: null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1 })),
+  loadDoc: (doc) => { sims.clear(); set((s) => ({ ...doc, selectedId: null, placing: null, panel: s.panel === 'save' ? 'save' : null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1 })) },
+  resetWorld: () => { sims.clear(); set((s) => ({ ...defaultWorld(), selectedId: null, placing: null, timeEase: 'slow', cameraResetTick: s.cameraResetTick + 1 })) },
```

`simulation.ts` does not import the store, so this import does not cycle. Merge with finding 3 as noted there.

### 5. Pressing the weather that is already active still moves the clock — severity medium, confidence high

- File(s)/lines: `src/state/worldStore.ts` `setWeather` lines 84–90

- Repro: `/?fresh&t=10`, then `setTime(22, 'drag')` and `setWeather('clear')` while weather is already `clear`.
  - Observed: `time` becomes `9`.
  - Expected: time stays `22`. Changing weather still applies the presets: starry stays at night when the hour is already night, sunset from another weather goes to `18.6`, and starry → clear still goes to `9` (that jump is what the existing e2e covers).

- Root cause: the daytime branch is `else if (t > 20 || t < 5) set({ weather, time: 9 })` with no “already on this weather” check. The sunset branch always writes `18.6`, so pressing 黄昏 again after the user nudged the dial snaps back to 18.6 for the same reason (same function; the probe failed on the clear case before it logged the sunset re-click).

```diff
--- a/src/state/worldStore.ts
+++ b/src/state/worldStore.ts
@@ -84,6 +84,7 @@ export const useWorld = create<WorldState>((set, get) => ({
   setTime: (time, ease = 'drag') => set({ time: ((time % 24) + 24) % 24, timeEase: ease }),
   setWeather: (weather) => {
+    if (weather === get().weather) return
     const t = get().time
     if (weather === 'sunset') set({ weather, time: 18.6, timeEase: 'slow' })
```

### 6. Closing the tab inside the autosave debounce drops the last edit — severity medium, confidence high

- File(s)/lines: `src/ui/Feedback.tsx` `useAppEffects` lines 85–103

- Repro: open `/?fresh`, `localStorage.removeItem('world-listens.autosave.v1')`, `setName('flush-check')`, `resetWorld()`, then `window.dispatchEvent(new Event('pagehide'))` before 800ms.
  - Observed: `localStorage['world-listens.autosave.v1']` is `null`.
  - Expected: the key holds the world as it is at hide time (name `我的世界` after the reset, and not `flush-check`). A visit that never edits must not overwrite a previously stored autosave: `loadDoc` of the autosave runs before `subscribe`, so `last` stays `''` until a real edit.

- Root cause: the only write is an 800ms `setTimeout`. Unmount clears that timer. There is no `pagehide` / `pagehide` flush.

```diff
--- a/src/ui/Feedback.tsx
+++ b/src/ui/Feedback.tsx
@@ -92,6 +92,13 @@ export function useAppEffects() {
       clearTimeout(timer)
       timer = window.setTimeout(() => writeAutosave(useWorld.getState().getDoc()), 800)
     })
+    const flush = () => {
+      if (!last) return
+      clearTimeout(timer)
+      writeAutosave(useWorld.getState().getDoc())
+    }
+    window.addEventListener('pagehide', flush)
     startSurprises()
@@ -100,7 +107,7 @@ export function useAppEffects() {
       }).catch(() => useWorld.getState().toast('分享链接无法解析，已打开默认世界', 'error'))
     }
-    return () => { unsub(); clearTimeout(timer) }
+    return () => { unsub(); clearTimeout(timer); window.removeEventListener('pagehide', flush) }
```

### 7. The share link is a snapshot from when the panel opened — severity medium, confidence high

- File(s)/lines: `src/ui/TopActions.tsx` `SharePanel` lines 136–143

- Repro: `/?fresh&t=10`, open the share panel, wait until `[data-testid=share-link]` contains `#w=`, then `setTime(4.25, 'drag')` and wait 4s.
  - Observed: the input value is unchanged.
  - Expected: the input updates to a link for the edited document. (The production bundle does not serve `/src/state/serialize.ts`, so the probe checked the string, not a second decode.)

- Root cause: the effect depends on `[]` and encodes `getDoc()` once. The dial, rail, and canvas stay interactive behind the popover.

```diff
--- a/src/ui/TopActions.tsx
+++ b/src/ui/TopActions.tsx
@@ -136,10 +136,23 @@ function SharePanel() {
   useEffect(() => {
     let alive = true
-    encodeShare(useWorld.getState().getDoc()).then((code) => {
-      if (!alive) return
-      setLink(`${location.origin}${location.pathname}#w=${code}`)
-    })
-    return () => { alive = false }
+    let seq = 0
+    let timer = 0
+    const schedule = () => {
+      const ticket = ++seq
+      clearTimeout(timer)
+      timer = window.setTimeout(() => {
+        encodeShare(useWorld.getState().getDoc()).then((code) => {
+          if (!alive || ticket !== seq) return
+          setLink(`${location.origin}${location.pathname}#w=${code}`)
+        }).catch(() => {})
+      }, 200)
+    }
+    const unsub = useWorld.subscribe((s, prev) => {
+      if (s.name === prev.name && s.time === prev.time && s.weather === prev.weather && s.gravity === prev.gravity && s.orbit === prev.orbit && s.objects === prev.objects && s.clouds === prev.clouds) return
+      schedule()
+    })
+    schedule()
+    return () => { alive = false; unsub(); clearTimeout(timer) }
   }, [])
```

### 8. `?t=` outside 0–24 is stored as-is, and a non-finite hour poisons the sun — severity medium, confidence high

- File(s)/lines: `src/state/worldStore.ts` line 67 (URL) and line 83 (`setTime`). `timeLabel` in `src/world/sun.ts` lines 42–44 prints `Math.floor(hour)` with no wrap, so 30 is the label `30:00`.

- Repro: open `/?t=30` (no `fresh`).
  - Observed: `getState().time === 30`.
  - Expected: `((30 % 24) + 24) % 24 === 6`, dial label `06:00`. Same wrap as `setTime` already uses for in-app changes (`24 → 0`, `-1 → 23`).

- Root cause: the URL path assigns `Number(tParam)` whenever it is finite and does not wrap. `setTime` does wrap, but `Infinity % 24` and a `NaN` from the dial (`fromEvent` divides by `svg` width 0) are not finite, and the assignment stores `NaN`. `SunRig` then chases `NaN` forever. The finite guard is that path; it was not separately clicked in the browser.

```diff
--- a/src/state/worldStore.ts
+++ b/src/state/worldStore.ts
@@ -63,8 +63,9 @@ let uid = 0
 const newId = (p: string) => `${p}-${Date.now().toString(36)}${(uid++).toString(36)}`
 let toastId = 0
+const wrap24 = (t: number) => ((t % 24) + 24) % 24
 
 const base = defaultWorld()
-if (tParam !== null && Number.isFinite(Number(tParam))) base.time = Number(tParam)
+if (tParam !== null && Number.isFinite(Number(tParam))) base.time = wrap24(Number(tParam))
@@ -80,7 +81,10 @@ export const useWorld = create<WorldState>((set, get) => ({
 
   setStyle: (style) => set({ style }),
-  setTime: (time, ease = 'drag') => set({ time: ((time % 24) + 24) % 24, timeEase: ease }),
+  setTime: (time, ease = 'drag') => {
+    if (!Number.isFinite(time)) return
+    set({ time: wrap24(time), timeEase: ease })
+  },
```

Saved documents hit the same clock bug through `parseWorld` (finding 9), not through this line.

### 9. `parseWorld` throws away a whole save for one bad entry, and keeps unsafe times, ids, and positions — severity medium, confidence high

- File(s)/lines: `src/state/serialize.ts` `vec` lines 6–7, object/cloud `flatMap` lines 14–29, `time: num(r.time, 8, 0, 24)` line 33. `readAutosave` (line 99) turns any throw into `null`, so one bad entry discards the autosave.

- Repro (browser): autosave JSON `{v:1, name:'残卷', time:30, objects:[{id:'tree-keep', type:'tree', pos:[3,1,-4]}, null], clouds:[{id:'cloud-keep', pos:[10,80,-220], scale:1, seed:2}, null]}`, open the app with no `?fresh` and no `?t`.
  - Observed: name stays `我的世界`. `tree-keep` is gone. `readAutosave` threw on `null.pos`.
  - Expected: name `残卷`, ids `tree-keep` and `cloud-keep` kept, `time === 6`.
- Repro (node, `qa-tests/serialize-probe.mjs` against unfixed code): `objects:[null]` throws `Cannot read properties of null (reading 'pos')`. Duplicate id `same` on a tree, a rock, and a cloud is kept, and `''` / `'   '` are kept. `time: 24` stays 24, `time: -1` clamps to 0, `time: 30` clamps to 24. `pos: [1e308, -1e308, 1e20]` is kept. `terrainHeight(1e308)` is `NaN`.
  - Expected: skip non-objects; every id unique and non-blank across objects and clouds; time wrapped onto `[0, 24)` (`24 → 0`, `30 → 6`, `-1 → 23`, `18.64` unchanged, `NaN → 8`); each axis finite and within ±5000.

- Root cause: `flatMap` casts each entry and reads `.pos` before the validity check. `num(..., 0, 24)` is an inclusive clamp, so 24 is a legal stored hour while `setTime` would have wrapped it. `vec` accepts any finite component, including values that make terrain height `NaN`. Ids are not checked for empty or duplicates, and objects and clouds share one selection namespace.

```diff
--- a/src/state/serialize.ts
+++ b/src/state/serialize.ts
@@ -3,8 +3,20 @@ import type { WorldDoc, WorldObject, CloudObject, ObjType, WeatherId } from './t
 const OBJ_TYPES: ObjType[] = ['tree', 'pine', 'rock', 'house', 'tower', 'island', 'bench', 'lamp']
 const WEATHERS: WeatherId[] = ['clear', 'cloudy', 'mist', 'sunset', 'starry']
 const num = (v: unknown, d: number, lo = -1e5, hi = 1e5) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
-const vec = (v: unknown): [number, number, number] | null =>
-  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : null
+const POS_LIM = 5000
+const vec = (v: unknown): [number, number, number] | null => {
+  if (!Array.isArray(v) || v.length !== 3) return null
+  const out: [number, number, number] = [0, 0, 0]
+  for (let i = 0; i < 3; i++) {
+    const n = v[i]
+    if (typeof n !== 'number' || !Number.isFinite(n)) return null
+    out[i] = Math.min(POS_LIM, Math.max(-POS_LIM, n))
+  }
+  return out
+}
+const wrapHour = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? ((v % 24) + 24) % 24 : 8)
@@ -12,21 +24,32 @@ export function parseWorld(raw: unknown): WorldDoc {
   const r = raw as Record<string, unknown>
   if (r.v !== 1) throw new Error('unsupported version')
+  const seen = new Set<string>()
+  const claim = (rawId: unknown) => {
+    let id = typeof rawId === 'string' ? rawId.trim().slice(0, 40) : ''
+    if (!id || seen.has(id)) {
+      do { id = Math.random().toString(36).slice(2, 10) } while (!id || seen.has(id))
+    }
+    seen.add(id)
+    return id
+  }
   const objects: WorldObject[] = (Array.isArray(r.objects) ? r.objects : []).slice(0, 400).flatMap((o): WorldObject[] => {
+    if (!o || typeof o !== 'object') return []
     const x = o as Record<string, unknown>
     const pos = vec(x.pos)
     if (!pos || !OBJ_TYPES.includes(x.type as ObjType)) return []
     return [{
-      id: typeof x.id === 'string' ? x.id.slice(0, 40) : Math.random().toString(36).slice(2),
+      id: claim(x.id),
       type: x.type as ObjType, pos, rotY: num(x.rotY, 0), scale: num(x.scale, 1, 0.2, 5), variant: Math.floor(num(x.variant, 0, 0, 20)),
       floating: x.floating === true || undefined,
     }]
   })
   const clouds: CloudObject[] = (Array.isArray(r.clouds) ? r.clouds : []).slice(0, 60).flatMap((c): CloudObject[] => {
+    if (!c || typeof c !== 'object') return []
     const x = c as Record<string, unknown>
     const pos = vec(x.pos)
     if (!pos) return []
-    return [{ id: typeof x.id === 'string' ? x.id.slice(0, 40) : Math.random().toString(36).slice(2), pos, scale: num(x.scale, 1, 0.2, 5), seed: Math.floor(num(x.seed, 1, 0, 1e6)) }]
+    return [{ id: claim(x.id), pos, scale: num(x.scale, 1, 0.2, 5), seed: Math.floor(num(x.seed, 1, 0, 1e6)) }]
   })
@@ -30,7 +53,7 @@ export function parseWorld(raw: unknown): WorldDoc {
   return {
     v: 1,
     name: typeof r.name === 'string' ? r.name.slice(0, 40) : '我的世界',
-    time: num(r.time, 8, 0, 24),
+    time: wrapHour(r.time),
```

### 10. Share decode inflates a few-kilobyte bomb into megabytes — severity medium, confidence high

- File(s)/lines: `src/state/serialize.ts` `decodeShare` lines 71–76

- Repro: `qa-tests/serialize-probe.mjs` builds a `z` payload whose deflate-raw body is well under 200k characters and inflates to a JSON document with a 2,000,000-character `name` (~2,000,096 bytes). It also sends `'z' + 'A'.repeat(250_000)`.
  - Observed: both were accepted (the bomb parses; the huge string is handed to `atob` / inflate with no early reject). Truncated and wrong-kind strings already throw.
  - Expected: reject a share string longer than 200,000 characters before inflate, and reject inflated output larger than 1.5MB. A normal world is a few hundred bytes, so this does not change real links. The UI already toasts `分享链接无法解析` on throw.

- Root cause: `decodeShare` inflates whatever `z` body it is given and `JSON.parse`s the result. Highly compressible JSON expands far past the URL size.

```diff
--- a/src/state/serialize.ts
+++ b/src/state/serialize.ts
@@ -68,10 +68,16 @@ export async function encodeShare(doc: WorldDoc): Promise<string> {
   return 'j' + b64url(json)
 }
 
+const MAX_SHARE_CHARS = 200_000
+const MAX_JSON_BYTES = 1_500_000
+
 export async function decodeShare(s: string): Promise<WorldDoc> {
+  if (typeof s !== 'string' || s.length < 2 || s.length > MAX_SHARE_CHARS) throw new Error('bad share')
   const kind = s[0], body = s.slice(1)
+  if (kind !== 'z' && kind !== 'j') throw new Error('bad share')
   const bytes = fromB64url(body)
   const json = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes
+  if (json.byteLength > MAX_JSON_BYTES) throw new Error('share too large')
   return parseWorld(JSON.parse(new TextDecoder().decode(json)))
 }
```

### 11. Sun-dial drag keeps running after the sun glyph unmounts at dusk — severity medium, confidence high

- File(s)/lines: `src/ui/SunDial.tsx` lines 66–69. Night glyph swaps at `sunAt(shown).elevation < -2` (about 19.75 sun → 20.00 moon), lines 47–48 and 88–90.

- Repro: `/?fresh&t=19.7`, pointerdown on `.sun-knob`, `setTime(22, 'drag')` while held (knob unmounts, `.moon` mounts), pointerup at `(8, 8)`, then move over `.dial-svg` with the button up.
  - Observed: time went from `22` to `7.166…`.
  - Expected: time stays `22` after pointerup.

- Root cause: `setPointerCapture` is called on `e.target`, the circle that unmounts when the icon switches. Capture dies with that node, `onPointerUp` on the svg never runs, and `drag.current` stays `true`, so a later `pointermove` over the track calls `fromEvent`.

```diff
--- a/src/ui/SunDial.tsx
+++ b/src/ui/SunDial.tsx
@@ -63,10 +63,11 @@ export function SunDial() {
         tabIndex={0}
-        onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); fromEvent(e) }}
+        onPointerDown={(e) => { drag.current = true; svg.current?.setPointerCapture(e.pointerId); fromEvent(e) }}
         onPointerMove={(e) => drag.current && fromEvent(e)}
         onPointerUp={() => { drag.current = false }}
         onPointerCancel={() => { drag.current = false }}
+        onLostPointerCapture={() => { drag.current = false }}
```

### 12. Any pointer can end or retarget an object drag — severity medium, confidence high

- File(s)/lines: `src/scene/systems/InteractionController.tsx` `beginDrag` lines 24–35, `onMove` lines 75–80, `onUp` lines 111–118. `DragState.pointerId` is stored and never read.

- Repro: move `bench-0` to `[0, 1.2, -18]` (its default projection sits under the dial, around y=770, so a click there never starts a drag). Pointerdown on the projected bench, then `pointermove` + `pointerup` on `window` with `pointerId: 77`.
  - Observed: `dragging` becomes false. The foreign `pointerup` ended the drag.
  - Expected: the drag stays active and the bench does not jump; only the pointer that called `beginDrag` moves or releases it. A foreign `pointerup` must also not leave `downOnCanvas` set, or the next up is treated as a click.

- Root cause: `onMove` / `onUp` are window listeners and ignore `pointerId`. The matching `pointerup` returns before `downOnCanvas = false`. A second `beginDrag` from another finger replaces `interaction.drag`.

```diff
--- a/src/scene/systems/InteractionController.tsx
+++ b/src/scene/systems/InteractionController.tsx
@@ -24,6 +24,7 @@ export function occludedByGround(r: THREE.Ray, dist: number) {
 export function beginDrag(e: ThreeEvent<PointerEvent>, kind: DragKind, id: string, rest: Vec3, planeY?: number) {
   e.stopPropagation()
   interaction.pressConsumed = true
+  if (interaction.drag && interaction.drag.pointerId !== e.nativeEvent.pointerId) return
   const grab = new THREE.Vector3()
@@ -76,6 +77,7 @@ export function InteractionController() {
       const d = interaction.drag
       if (d) {
+        if (e.pointerId !== d.pointerId) return
         if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return
@@ -112,7 +114,9 @@ export function InteractionController() {
       const d = interaction.drag
       if (d) {
+        if (e.pointerId !== d.pointerId) return
         interaction.drag = null
+        downOnCanvas = false
         if (controlsRef) controlsRef.enabled = true
         st.setDragging(false)
         return
```

### 13. Deleting a placed tree does not free its cloned geometries — severity medium, confidence high

- File(s)/lines: `src/scene/common/AssetTrees.tsx` `useAssetModel` lines 53–92 (clone + `applyMatrix4`, no dispose) and `AssetTreeVisual` material clone lines 195–203. `src/scene/objects/WorldObjects.tsx` line 171 creates `blobMat` per editable object and never disposes it. `src/main.tsx` wraps the app in `StrictMode`.

- Repro: `/?fresh&t=10`, read `renderer.info.memory.geometries` (94), `addObject('tree', …)`, wait until the count rises, `removeObject`.
  - Observed: 94 → 122 → 122 after delete and three frames.
  - Expected: after unmount, the count returns to within 1 of the start. The cloned materials and the per-object contact-shadow material should be disposed in the same cleanup. Shared `treeMaterial` / `matCache`, `blobTex`, and the outline override material must not be disposed.

- Root cause: each `useAssetModel` clones buffer geometries for that instance (the selected tree mounts a second copy for the outline). `AssetTreeVisual` clones a `MeshStandardMaterial` per part. Nothing calls `dispose()` on unmount, so `renderer.info` keeps the GPU buffers. A naive dispose in `useEffect` cleanup also runs on StrictMode’s dev remount and would free geometries the remounted tree still draws; the token below ignores that extra pass. Geometry counts were measured. The material and `blobMat` cleanups are the same missing `dispose`; their `info.memory` counts were not sampled separately (confidence medium for those two).

```diff
--- a/src/scene/common/AssetTrees.tsx
+++ b/src/scene/common/AssetTrees.tsx
@@ -1,4 +1,4 @@
-import { useLayoutEffect, useMemo, useRef } from 'react'
+import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
@@ -52,7 +52,7 @@ export type AssetModel = ReturnType<typeof useAssetModel>
 export function useAssetModel(name: string) {
   const gltf = useGLTF(url(name))
-  return useMemo(() => {
+  const model = useMemo(() => {
@@ -89,6 +89,20 @@ export function useAssetModel(name: string) {
     return { parts, height: box.max.y - box.min.y, minY: box.min.y }
   }, [gltf])
+  useEffect(() => {
+    const token = {}
+    const bag = model as { token?: object; parts: Part[] }
+    bag.token = token
+    return () => {
+      queueMicrotask(() => {
+        if (bag.token !== token) return
+        for (const p of bag.parts) p.geo.dispose()
+      })
+    }
+  }, [model])
+  return model
 }
@@ -201,6 +215,17 @@ export function AssetTreeVisual(...) {
     return m
   }), [model, override, tint, pine])
+  useEffect(() => {
+    if (override) return
+    const token = {}
+    const bag = mats as THREE.Material[] & { token?: object }
+    bag.token = token
+    return () => {
+      queueMicrotask(() => {
+        if (bag.token !== token) return
+        for (const m of mats) m.dispose()
+      })
+    }
+  }, [mats, override])
```

```diff
--- a/src/scene/objects/WorldObjects.tsx
+++ b/src/scene/objects/WorldObjects.tsx
@@ -1,4 +1,4 @@
-import { memo, Suspense, useMemo, useRef } from 'react'
+import { memo, Suspense, useEffect, useMemo, useRef } from 'react'
@@ -169,6 +169,14 @@ const EditableObject = memo(function EditableObject({ obj, selected }: { obj: Wo
   const blobMat = useMemo(() => new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: '#1d2a3a', opacity: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }), [])
+  useEffect(() => {
+    const mat = blobMat as THREE.Material & { token?: object }
+    const token = {}
+    mat.token = token
+    return () => {
+      queueMicrotask(() => { if (mat.token === token) mat.dispose() })
+    }
+  }, [blobMat])
```

### 14. `addObject` ignores the 400-object cap that load/share enforce — severity medium, confidence high

- File(s)/lines: `src/state/worldStore.ts` `addObject` lines 93–97 and `cloudToIsland` lines 104–109. `parseWorld` already does `.slice(0, 400)`.

- Repro: from a fresh world, call `addObject('rock', …)` until `getState().objects.length` stops growing, then once more. Read `getState()` after each call (the state object from before the loop does not update).
  - Observed: length 400, the next call returned `"rock-…"`, length 401.
  - Expected: the 401st call returns `''` and the length stays 400. Turning a cloud into an island is the other insert path and needs the same stop. Reload/share would otherwise drop the newest objects with no error.

- Root cause: `addObject` always appends. The cap exists only on the way back in through `parseWorld`.

```diff
--- a/src/state/worldStore.ts
+++ b/src/state/worldStore.ts
@@ -63,6 +63,7 @@ let uid = 0
 const newId = (p: string) => `${p}-${Date.now().toString(36)}${(uid++).toString(36)}`
 let toastId = 0
+const OBJECT_CAP = 400
@@ -93,6 +94,10 @@ export const useWorld = create<WorldState>((set, get) => ({
   setName: (name) => set({ name: name.slice(0, 40) }),
 
   addObject: (type, pos, extra) => {
+    if (get().objects.length >= OBJECT_CAP) {
+      get().toast('场景物件已达上限（400）', 'info')
+      return ''
+    }
     const id = newId(type)
@@ -104,6 +109,10 @@ export const useWorld = create<WorldState>((set, get) => ({
   cloudToIsland: (id) => {
     const c = get().clouds.find((x) => x.id === id)
     if (!c) return null
+    if (get().objects.length >= OBJECT_CAP) {
+      get().toast('场景物件已达上限（400）', 'info')
+      return null
+    }
     const islandId = newId('island')
```

### 15. Ctrl/Cmd/Alt+F toggles float on the selected object — severity low, confidence high

- File(s)/lines: `src/ui/Feedback.tsx` line 120

- Repro: select `bench-0` (not an island, `floating` is `undefined`), press `Control+F`.
  - Observed: `floating` becomes `true`. The browser find dialog is the other consumer of that chord.
  - Expected: with Ctrl, Cmd, or Alt held, `f` does not change the object. A bare `f` / `F` still toggles float.

- Root cause: the handler treats `e.key === 'f'` and does not look at modifier keys. It already bails out for `INPUT` / `TEXTAREA`.

```diff
--- a/src/ui/Feedback.tsx
+++ b/src/ui/Feedback.tsx
@@ -117,7 +117,7 @@ export function useAppEffects() {
       if (!obj) return
       if (e.key === 'Delete' || e.key === 'Backspace') { st.deleteWithUndo(obj.id); sims.delete(obj.id); e.preventDefault() }
       else if (e.key === 'r' || e.key === 'R') st.updateObject(obj.id, { rotY: obj.rotY + (e.shiftKey ? 1 : -1) * Math.PI / 12 })
-      else if (e.key === 'f' || e.key === 'F') { if (obj.type !== 'island') st.toggleFloat(obj.id) }
+      else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) { if (obj.type !== 'island') st.toggleFloat(obj.id) }
```

## Tests

All three scripts live under `/workspace/wl-qa/qa-tests/`. They assert the corrected behaviour, so they fail on the unfixed build. They were not re-run after the patches. `npx tsc -b` on the patched tree exited 0.

- `qa-tests/serialize-probe.mjs` — loads `parseWorld` / `encodeShare` / `decodeShare` / `toJSON` through Vite SSR. Checks null entries skipped, duplicate and blank ids rewritten, time wrap, positions clamped to ±5000, a normal round-trip, truncated / wrong-kind / oversized shares and a ~2MB decompression bomb throwing, and `toJSON(23.916…)` staying under 24. Result on unfixed code: **2/7 passed** (round-trip, toJSON). The other five failed as in findings 9 and 10.

- `qa-tests/browser-probe.mjs` — Playwright against `BASE` (default `http://127.0.0.1:4174`), SwiftShader. Checks surprises `{}`, blocked `localStorage`, undo-after-reset, weather re-click, `pagehide` autosave, live share link, `?t=30`, corrupt autosave, sims after reset, camera on desktop resize, second pointer, sun-dial capture, tree geometry dispose, 400 cap, mobile delete at 320px, malformed `#w=zzzzzz`. Result on the unfixed preview: **3/16 passed** (camera after two animation frames, mobile delete on screen, malformed hash toast + default name). Failures match findings 1–9, 11, and 13. Two lines in that run were bad probes, not extra bugs: the 400-cap check read a stale `getState()` snapshot and reported length 10; the pointer check clicked the bench under the dial (projected y ≈ 770) so the drag never started. Both are corrected in the file and covered by the edge probe below. The corrected file was not re-run as a whole.

- `qa-tests/edge-probe.mjs` — cap with a fresh `getState()` each iteration, Ctrl+F, second pointer after moving the bench to `[0, 1.2, -18]`, and a resize that waits until the canvas is actually ~1100px. Result on the unfixed preview, killed during the camera case: **0 of the three finished tests passed** — 401st rock accepted (`after: 401`), Ctrl+F set `floating` from `undefined` to `true`, foreign `pointerup` cleared `dragging`. The camera case printed nothing.

## Checked and OK

- `/?fresh#w=zzzzzz` toasts `分享链接无法解析` and leaves the name `我的世界`.
- At 320×700, selecting `house-0` keeps `[data-act="删除"]` inside the viewport (`selection-bar`).
- A normal document round-trips through `encodeShare` / `decodeShare`. Truncated and garbage shares already throw.
- `toJSON` of time `23.916666…` stays below 24 (it does not round up to the clamp edge).
- Plain undo (no reset in between) restores a single `bench-0`.
- Switching weather still moves the clock: the clear-at-night jump to 9 is the branch used when the weather actually changes. The bug is only the re-click.
- One desktop resize (1280×800 → 1100×760), read after two animation frames, left the orbited camera away from its home pose. A stricter “wait until the canvas width is 1100, then 600ms” check was interrupted before it printed, so a snap-on-resize bug is not reported.
- `parseWorld` still rejects a non-object body and `v !== 1`, drops unknown object types, clamps scale/variant/gravity, and ignores a non-boolean `orbit`. `listSaves` skips a bad slot. `writeAutosave` already swallows quota errors.
