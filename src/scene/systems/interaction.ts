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

/** In free-roam, touches drive the camera (look / pinch / double-tap glide): they never select or drag things. */
export const roamTouch = (e: { nativeEvent?: PointerEvent; pointerType?: string }) =>
  (e.nativeEvent?.pointerType ?? e.pointerType) === 'touch' && (window as unknown as { __world?: { getState(): { camMode: string } } }).__world?.getState().camMode === 'roam'
