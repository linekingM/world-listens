import { MathUtils, type Vector3 } from 'three'
import { terrainHeight, islandSpec } from '../../world/layout'
import type { WorldObject } from '../../state/types'

/** Soft world bounds for the free-roam camera (metres). */
export const ROAM_BOUNDS = { minX: -280, maxX: 280, minZ: -440, maxZ: 130, maxY: 170 }

/**
 * Keep a camera out of the ground and out of floating-island rock.
 * Islands are approximated as an inverted cone (wide grassy top, narrow base); standing on the top is allowed.
 */
export function collideCamera(p: Vector3, objects: readonly WorldObject[], eye = 2.5) {
  for (const o of objects) {
    if (o.type !== 'island') continue
    const spec = islandSpec(o.variant)
    const s = o.scale
    const R = spec.radius * s + 1.5
    const top = o.pos[1] + 0.6 * s
    const bottom = o.pos[1] - spec.depth * s
    if (p.y < bottom || p.y > top + eye) continue
    const dx = p.x - o.pos[0], dz = p.z - o.pos[2]
    const d = Math.hypot(dx, dz)
    // cone radius at this height (narrow at the base, full at the top)
    const r = R * MathUtils.clamp((p.y - bottom) / (top - bottom), 0.2, 1)
    if (d >= r) continue
    if (p.y > top - 1.5) p.y = top + eye // land on the grass
    else if (d > 1e-3) { p.x = o.pos[0] + (dx / d) * r; p.z = o.pos[2] + (dz / d) * r }
    else p.x = o.pos[0] + r
  }
  const g = terrainHeight(p.x, p.z) + eye
  if (p.y < g) p.y = g
}

/** Pull a position back inside the roam bounds (soft spring, never a hard wall). */
export function softBounds(p: Vector3, dt: number) {
  const b = ROAM_BOUNDS, k = 1 - Math.exp(-dt * 3)
  p.x += (MathUtils.clamp(p.x, b.minX, b.maxX) - p.x) * k
  p.z += (MathUtils.clamp(p.z, b.minZ, b.maxZ) - p.z) * k
  p.y += (Math.min(p.y, b.maxY) - p.y) * k
}
