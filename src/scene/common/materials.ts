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
    if (role === 'city') addFogScale(m, 0.55)
    if (role === 'rock') { addFogScale(m, 0.62); addLeafGlow(m, 0.6) }
    if (role === 'city' && m instanceof THREE.MeshStandardMaterial) addWindowGlints(m)
    cache.set(key, m)
  }
  return m
}
