import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStyleDef } from './EnvContext'
import { addWind } from './materialFx'
import { ROAD_WIDTH, roadX, terrainHeight } from '../../world/layout'
import { fbm, rng } from '../../lib/random'

/** A tuft = three crossed tapered blades (vertex colours: dark root → light tip). */
function tuftGeometry(rootHex: string, tipHex: string) {
  const pos: number[] = [], colr: number[] = []
  const root = new THREE.Color(rootHex).multiplyScalar(0.8), tip = new THREE.Color(tipHex)
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI + 0.3
    const ca = Math.cos(a) * 0.09, sa = Math.sin(a) * 0.09
    const lean = (b - 1) * 0.08
    const h = 0.32 + b * 0.07
    const tx = lean * Math.cos(a + 1.57), tz = lean * Math.sin(a + 1.57)
    // both windings, single-sided material: avoids three's back-face normal flip (blades would go dark)
    pos.push(-ca, 0, -sa, ca, 0, sa, tx, h, tz, ca, 0, sa, -ca, 0, -sa, tx, h, tz)
    for (let k = 0; k < 2; k++) colr.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3))
  g.computeVertexNormals()
  // grass normals point up so blades light like the meadow they stand in
  const n = g.getAttribute('normal')
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0)
  return g
}

/** Instanced wind-swept grass tufts close to the camera and road, with colour variation. */
export function Grass({ count = 16000 }: { count?: number }) {
  const style = useStyleDef()
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => tuftGeometry(style.palette.grassA, style.palette.grassDry), [style])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    addWind(m, 0.12, 0.45)
    return m
  }, [])
  useLayoutEffect(() => {
    const r = rng(2024)
    const m = ref.current
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler()
    const c = new THREE.Color()
    const lush = new THREE.Color(style.palette.grassB), dry = new THREE.Color(style.palette.grassDry)
    let i = 0, guard = 0
    while (i < count && guard++ < count * 6) {
      const z = 34 - Math.pow(r(), 1.8) * 110
      const side = r() < 0.5 ? -1 : 1
      const d = ROAD_WIDTH * 0.6 + Math.pow(r(), 1.4) * (14 + (34 - z) * 0.3)
      const x = roadX(z) + side * d
      // clumpy distribution
      const clump = fbm(x * 0.09, z * 0.09, 2)
      if (r() > clump * 1.5) continue
      P.set(x, terrainHeight(x, z) - 0.05, z)
      E.set((r() - 0.5) * 0.25, r() * Math.PI * 2, (r() - 0.5) * 0.25)
      Q.setFromEuler(E)
      const s = 0.8 + r() * 0.7 + clump * 0.5
      S.set(s, s * (0.8 + r() * 0.6), s)
      m.setMatrixAt(i, M.compose(P, Q, S))
      const v = fbm(x * 0.03 + 7, z * 0.03, 2)
      c.setRGB(1, 1, 1).lerp(lush.clone().multiplyScalar(1.5), v * 0.5).lerp(dry.clone().multiplyScalar(1.3), Math.max(0, fbm(x * 0.05 - 3, z * 0.05, 2) - 0.45) * 1.4)
      c.multiplyScalar(0.85 + r() * 0.35)
      m.setColorAt(i, c)
      i++
    }
    m.count = i
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [count, style])
  return <instancedMesh ref={ref} args={[geo, mat, count]} receiveShadow frustumCulled={false} />
}
