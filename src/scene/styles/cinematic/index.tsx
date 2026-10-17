import * as THREE from 'three'
import type { StyleDef, MaterialRole } from '../types'
import { paletteA, lightKeysA } from './palette'
import { SkyA } from './SkyA'
import { CloudsA } from './CloudsA'
import { EffectsA } from './EffectsA'

function makeMaterial(role: MaterialRole): THREE.Material {
  const base = { vertexColors: true, metalness: 0 }
  switch (role) {
    case 'road': return new THREE.MeshStandardMaterial({ ...base, roughness: 0.82 })
    case 'city': return new THREE.MeshStandardMaterial({ ...base, roughness: 0.55, metalness: 0.15, color: '#ffffff' })
    case 'building': return new THREE.MeshStandardMaterial({ ...base, roughness: 0.8 })
    case 'mountain': return new THREE.MeshStandardMaterial({ ...base, roughness: 1 })
    case 'foliage': return new THREE.MeshStandardMaterial({ ...base, roughness: 0.88 })
    default: return new THREE.MeshStandardMaterial({ ...base, roughness: 0.95 })
  }
}

export const styleA: StyleDef = {
  id: 'a',
  name: '晨光电影感',
  subtitle: 'Cinematic Dawn',
  lowPoly: false,
  palette: paletteA,
  lightKeys: lightKeysA,
  fogDensity: 0.00042,
  exposure: 0.86,
  camera: { position: [8, 15, 38], target: [-4, 17, -80], fov: 50 },
  makeMaterial,
  Sky: SkyA,
  Clouds: CloudsA,
  Effects: EffectsA,
  shadowMapSize: 2048,
}
