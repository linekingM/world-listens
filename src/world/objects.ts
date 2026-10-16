import type { ObjType } from '../state/types'
import { islandSpec } from './layout'

export interface ObjectKind {
  type: ObjType
  label: string
  /** footprint radius at scale 1 (selection ring, contact shadow) */
  radius: number
  /** visual height at scale 1 (toolbar anchor) */
  height: number
  /** gravity response: 1 = light and lively, small = heavy and slow */
  lightness: number
  /** floats in the air rather than resting on the terrain */
  airborne?: boolean
  /** tumbles when weightless (rocks) vs stays upright and sways (trees) */
  tumble: number
}

export const OBJECT_KINDS: Record<ObjType, ObjectKind> = {
  tree: { type: 'tree', label: '树木', radius: 2.4, height: 6.2, lightness: 0.7, tumble: 0.15 },
  pine: { type: 'pine', label: '松树', radius: 2.0, height: 6.4, lightness: 0.7, tumble: 0.15 },
  rock: { type: 'rock', label: '岩石', radius: 1.6, height: 1.6, lightness: 1.0, tumble: 1 },
  house: { type: 'house', label: '小屋', radius: 2.2, height: 3.4, lightness: 0.6, tumble: 0.35 },
  tower: { type: 'tower', label: '塔楼', radius: 1.5, height: 7.0, lightness: 0.5, tumble: 0.25 },
  bench: { type: 'bench', label: '长椅', radius: 1.4, height: 1.3, lightness: 0.9, tumble: 0.6 },
  lamp: { type: 'lamp', label: '路灯', radius: 0.8, height: 4.5, lightness: 0.8, tumble: 0.4 },
  island: { type: 'island', label: '浮岛', radius: 8, height: 3, lightness: 0.3, airborne: true, tumble: 0.1 },
}

export const ADDABLE: ObjType[] = ['tree', 'pine', 'rock', 'house', 'tower', 'bench', 'lamp', 'island']

export function objectRadius(type: ObjType, variant: number, scale: number) {
  return (type === 'island' ? islandSpec(variant).radius : OBJECT_KINDS[type].radius) * scale
}
