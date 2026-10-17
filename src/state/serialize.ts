import type { WorldDoc, WorldObject, CloudObject, ObjType, WeatherId } from './types'

const OBJ_TYPES: ObjType[] = ['tree', 'pine', 'rock', 'house', 'tower', 'island', 'bench', 'lamp']
const WEATHERS: WeatherId[] = ['clear', 'cloudy', 'mist', 'sunset', 'starry']
const num = (v: unknown, d: number, lo = -1e5, hi = 1e5) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const POS_LIM = 5000
const vec = (v: unknown): [number, number, number] | null => {
  if (!Array.isArray(v) || v.length !== 3) return null
  const out: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const n = v[i]
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    out[i] = Math.min(POS_LIM, Math.max(-POS_LIM, n))
  }
  return out
}
/** Same wrap as setTime: 24 and 30 land inside [0, 24), not on the clamp edge. */
const wrapHour = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? ((v % 24) + 24) % 24 : 8)

/** Validate untrusted JSON (localStorage / share links) into a WorldDoc. Throws on garbage. */
export function parseWorld(raw: unknown): WorldDoc {
  if (!raw || typeof raw !== 'object') throw new Error('not an object')
  const r = raw as Record<string, unknown>
  if (r.v !== 1) throw new Error('unsupported version')
  const seen = new Set<string>()
  const claim = (rawId: unknown) => {
    let id = typeof rawId === 'string' ? rawId.trim().slice(0, 40) : ''
    if (!id || seen.has(id)) {
      do { id = Math.random().toString(36).slice(2, 10) } while (!id || seen.has(id))
    }
    seen.add(id)
    return id
  }
  const objects: WorldObject[] = (Array.isArray(r.objects) ? r.objects : []).slice(0, 400).flatMap((o): WorldObject[] => {
    if (!o || typeof o !== 'object') return []
    const x = o as Record<string, unknown>
    const pos = vec(x.pos)
    if (!pos || !OBJ_TYPES.includes(x.type as ObjType)) return []
    return [{
      id: claim(x.id),
      type: x.type as ObjType, pos, rotY: num(x.rotY, 0), scale: num(x.scale, 1, 0.2, 5), variant: Math.floor(num(x.variant, 0, 0, 20)),
      floating: x.floating === true || undefined,
    }]
  })
  const clouds: CloudObject[] = (Array.isArray(r.clouds) ? r.clouds : []).slice(0, 60).flatMap((c): CloudObject[] => {
    if (!c || typeof c !== 'object') return []
    const x = c as Record<string, unknown>
    const pos = vec(x.pos)
    if (!pos) return []
    return [{ id: claim(x.id), pos, scale: num(x.scale, 1, 0.2, 5), seed: Math.floor(num(x.seed, 1, 0, 1e6)) }]
  })
  return {
    v: 1,
    name: typeof r.name === 'string' ? r.name.slice(0, 40) : '我的世界',
    time: wrapHour(r.time),
    weather: WEATHERS.includes(r.weather as WeatherId) ? (r.weather as WeatherId) : 'clear',
    gravity: num(r.gravity, 1, -1, 1),
    orbit: r.orbit === true,
    objects,
    clouds,
    play: parsePlay(r.play),
  }
}

export const PLAY_RATES = [5, 15, 30, 60, 120]
function parsePlay(p: unknown): WorldDoc['play'] {
  if (!p || typeof p !== 'object') return undefined
  const x = p as Record<string, unknown>
  const rate = PLAY_RATES.includes(Number(x.rate)) ? Number(x.rate) : 30
  return { on: x.on === true, rate }
}

/** Compact JSON: round numbers so share links stay short. */
export function toJSON(doc: WorldDoc) {
  return JSON.stringify(doc, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))
}

const b64url = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

/** WorldDoc → URL-safe string (deflate when available, prefix tells which). */
export async function encodeShare(doc: WorldDoc): Promise<string> {
  const json = new TextEncoder().encode(toJSON(doc))
  if (typeof CompressionStream !== 'undefined') return 'z' + b64url(await pipe(json, new CompressionStream('deflate-raw')))
  return 'j' + b64url(json)
}

const MAX_SHARE_CHARS = 200_000
const MAX_JSON_BYTES = 1_500_000

export async function decodeShare(s: string): Promise<WorldDoc> {
  if (typeof s !== 'string' || s.length < 2 || s.length > MAX_SHARE_CHARS) throw new Error('bad share')
  const kind = s[0], body = s.slice(1)
  if (kind !== 'z' && kind !== 'j') throw new Error('bad share')
  const bytes = fromB64url(body)
  const json = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes
  if (json.byteLength > MAX_JSON_BYTES) throw new Error('share too large')
  return parseWorld(JSON.parse(new TextDecoder().decode(json)))
}

// ── local saves ──
const KEY = 'world-listens.saves.v1'
export interface SavedWorld { id: string; name: string; savedAt: number; doc: WorldDoc; thumb?: string }

export function listSaves(): SavedWorld[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(arr)) return []
    return arr.flatMap((s) => {
      try { return [{ id: String(s.id), name: String(s.name), savedAt: Number(s.savedAt), doc: parseWorld(s.doc), thumb: typeof s.thumb === 'string' ? s.thumb : undefined }] } catch { return [] }
    })
  } catch { return [] }
}

export function writeSaves(list: SavedWorld[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

// ── autosave (continue where you left off) ──
const AUTO = 'world-listens.autosave.v1'
export function readAutosave(): WorldDoc | null {
  try { const raw = localStorage.getItem(AUTO); return raw ? parseWorld(JSON.parse(raw)) : null } catch { return null }
}
export function writeAutosave(doc: WorldDoc) {
  try { localStorage.setItem(AUTO, toJSON(doc)) } catch { /* quota: ignore */ }
}
export function clearAutosave() { localStorage.removeItem(AUTO) }
