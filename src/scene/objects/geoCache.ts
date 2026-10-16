import type * as THREE from 'three'
import type { StyleDef } from '../styles/types'
import { buildBench, buildHouse, buildIsland, buildLamp, buildRock, buildTree } from '../../world/geometry'
import { islandSpec } from '../../world/layout'
import type { ObjType } from '../../state/types'

const cache = new Map<string, THREE.BufferGeometry>()

function memo(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key)
  if (!g) { g = make(); cache.set(key, g) }
  return g
}

/** Geometry for a single-mesh object type (everything except islands). */
export function objectGeometry(style: StyleDef, type: Exclude<ObjType, 'island'>, variant: number) {
  const opts = { lowPoly: style.lowPoly, palette: style.palette }
  const v = variant % 3
  return memo(`${style.id}|${type}|${v}`, () => {
    switch (type) {
      case 'tree': return buildTree(v === 2 ? 2 : 0, opts, v)
      case 'pine': return buildTree(1, opts, v)
      case 'rock': return buildRock(v, opts)
      case 'house': return buildHouse('house', v + 5, opts)
      case 'tower': return buildHouse('tower', v + 5, opts)
      case 'bench': return buildBench(opts)
      case 'lamp': return buildLamp(opts)
    }
  })
}

export function islandGeometries(style: StyleDef, variant: number) {
  const opts = { lowPoly: style.lowPoly, palette: style.palette }
  const spec = islandSpec(variant)
  return {
    spec,
    rock: memo(`${style.id}|island|${variant}`, () => buildIsland(spec, opts)),
    houses: spec.houses.map((h, i) => memo(`${style.id}|ih|${h.kind}|${(variant + i) % 6}`, () => buildHouse(h.kind, (variant + i) % 6, opts))),
    tree: memo(`${style.id}|it|${variant % 3}`, () => buildTree(0, opts, variant % 3)),
  }
}
