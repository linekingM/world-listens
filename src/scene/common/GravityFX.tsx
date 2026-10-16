import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEnv } from './EnvContext'
import { rng, smoothstep } from '../../lib/random'

const N = 700

/** Visual feedback for altered gravity: glowing motes and pollen drifting up out of the meadow. */
export function GravityFX() {
  const env = useEnv()
  const ref = useRef<THREE.Points>(null!)
  const { geo, seeds } = useMemo(() => {
    const r = rng(8)
    const pos = new Float32Array(N * 3)
    const seeds = new Float32Array(N * 4)
    for (let i = 0; i < N; i++) {
      seeds[i * 4] = -90 + r() * 170
      seeds[i * 4 + 1] = 30 - r() * 200
      seeds[i * 4 + 2] = r()
      seeds[i * 4 + 3] = 0.4 + r() * 0.8
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geo, seeds }
  }, [])
  const mat = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64
    const g = cv.getContext('2d')!
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grd.addColorStop(0, 'rgba(255,250,230,1)'); grd.addColorStop(0.3, 'rgba(255,230,170,0.6)'); grd.addColorStop(1, 'rgba(255,220,150,0)')
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
    return new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 0.9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: '#ffe7b0' })
  }, [])
  useFrame((s) => {
    const w = 1 - env.gravity
    const k = smoothstep(0.05, 0.6, w)
    mat.opacity = k * (0.55 + env.sun.night * 0.4)
    ref.current.visible = k > 0.01
    if (!ref.current.visible) return
    const t = s.clock.elapsedTime
    const p = geo.getAttribute('position') as THREE.BufferAttribute
    const rise = 2 + w * 4
    for (let i = 0; i < N; i++) {
      const x = seeds[i * 4], z = seeds[i * 4 + 1], ph = seeds[i * 4 + 2], sp = seeds[i * 4 + 3]
      const life = (t * sp * rise * 0.04 + ph) % 1
      p.setXYZ(i, x + Math.sin(t * 0.5 * sp + ph * 20) * 2.2, life * 26 + Math.sin(ph * 40) * 1.5, z + Math.cos(t * 0.4 * sp + ph * 11) * 2.2)
    }
    p.needsUpdate = true
  })
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />
}
