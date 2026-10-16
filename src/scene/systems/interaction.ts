/** Shared, non-React interaction state (pointer drags, placement ghost). */
import * as THREE from 'three'

export type DragKind = 'object' | 'cloud' | 'sun'
export interface DragState {
  kind: DragKind
  id: string
  /** horizontal plane height for airborne things; undefined = follow the terrain */
  planeY?: number
  grab: THREE.Vector3
  startX: number
  startY: number
  moved: boolean
  pointerId: number
}

export const interaction = {
  drag: null as DragState | null,
  /** set by any 3D handler that consumed the current press (prevents deselect-on-miss) */
  pressConsumed: false,
  ghost: new THREE.Vector3(),
  ghostValid: false,
  hoverSun: false,
}
