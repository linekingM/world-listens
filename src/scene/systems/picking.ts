import * as THREE from 'three'
import { terrainHeight } from '../../world/layout'

export const groundAt = (x: number, z: number) => terrainHeight(x, z)

/** Ray-march the analytic terrain height field; returns the hit point or null. */
export function rayGround(ray: THREE.Ray, out: THREE.Vector3, maxDist = 900): THREE.Vector3 | null {
  const o = ray.origin, d = ray.direction
  let t = 0.5, prevT = 0
  let prev = o.y - groundAt(o.x, o.z)
  if (prev < 0) return null
  while (t < maxDist) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t
    const h = y - groundAt(x, z)
    if (h < 0) {
      // bisect for precision
      let a = prevT, b = t
      for (let i = 0; i < 12; i++) {
        const m = (a + b) / 2
        const mh = o.y + d.y * m - groundAt(o.x + d.x * m, o.z + d.z * m)
        if (mh < 0) b = m; else a = m
      }
      return out.copy(d).multiplyScalar(b).add(o)
    }
    prev = h
    prevT = t
    t += Math.max(0.4, Math.min(h * 0.5, t * 0.03 + 0.6))
  }
  return null
}

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
export function rayPlaneY(ray: THREE.Ray, y: number, out: THREE.Vector3): THREE.Vector3 | null {
  plane.constant = -y
  const hit = ray.intersectPlane(plane, out)
  if (!hit) return null
  if (hit.distanceTo(ray.origin) > 3000) return null
  return hit
}

/** Allowed area for ground objects (keeps edits inside the composed valley). */
export const BOUNDS = { minX: -150, maxX: 150, minZ: -290, maxZ: 34 }
export const CLOUD_BOUNDS = { minX: -520, maxX: 520, minZ: -760, maxZ: -60 }
export const clampXZ = (v: THREE.Vector3, b = BOUNDS) => {
  v.x = THREE.MathUtils.clamp(v.x, b.minX, b.maxX)
  v.z = THREE.MathUtils.clamp(v.z, b.minZ, b.maxZ)
  return v
}
