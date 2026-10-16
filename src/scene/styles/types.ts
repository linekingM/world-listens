import type * as THREE from 'three'
import type { ComponentType } from 'react'
import type { LightKey } from '../../world/palette'
import type { WorldPalette } from '../../world/geometry'

export type MaterialRole = 'terrain' | 'foliage' | 'trunk' | 'building' | 'road' | 'rock' | 'city' | 'mountain' | 'prop'

export interface StyleDef {
  id: 'a' | 'b' | 'c'
  name: string
  subtitle: string
  lowPoly: boolean
  palette: WorldPalette
  lightKeys: LightKey[]
  /** exponential fog density at full day */
  fogDensity: number
  exposure: number
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number }
  makeMaterial: (role: MaterialRole) => THREE.Material
  Sky: ComponentType
  Clouds: ComponentType
  Effects: ComponentType
  /** extra style-only decoration */
  Extras?: ComponentType
  shadowMapSize: number
  shadowRadius?: number
}
