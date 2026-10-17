import * as THREE from 'three'
import type { MaterialRole, StyleDef } from '../styles/types'
import { addFogScale, addLeafGlow, addTerrainFx, addWind, addWindowGlints } from './materialFx'

const cache = new Map<string, THREE.Material>()

/** Shared, effect-patched materials per style + role (one program per role). */
export function getMaterial(style: StyleDef, role: MaterialRole): THREE.Material {
  const key = style.id + role
  let m = cache.get(key)
  if (!m) {
    m = style.makeMaterial(role)
    if (role === 'terrain') addTerrainFx(m)
    if (role === 'foliage') { addWind(m, 0.07, 7); addLeafGlow(m) }
    // city: much less fog by day so roofs/domes read; warm grazing rim from the low sun
    if (role === 'city') addFogScale(m, 0.36)
    if (role === 'rock') { addFogScale(m, 0.62); addLeafGlow(m, 0.6) }
    if (role === 'city' && m instanceof THREE.MeshStandardMaterial) addWindowGlints(m)
    if (role === 'city') addLeafGlow(m, 0.55) // after the glints (which declare the shared sun uniforms)
    cache.set(key, m)
  }
  return m
}
