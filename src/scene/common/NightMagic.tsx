import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEnv } from './EnvContext'
import { activeSurprises } from '../../state/surprises'
import { rng, smoothstep } from '../../lib/random'
import { ROAD_WIDTH, roadX, terrainHeight } from '../../world/layout'

function glowTexture(inner: string, outer: string) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const g = cv.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, inner); grd.addColorStop(0.25, outer); grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(cv)
}

/** Fireflies blinking over the meadow on clear nights. */
function Fireflies() {
  const env = useEnv()
  const N = 220
  const ref = useRef<THREE.Points>(null!)
  const { geo, base } = useMemo(() => {
    const r = rng(42)
    const base = new Float32Array(N * 4)
    for (let i = 0; i < N; i++) {
      const z = 30 - r() * 120, side = r() < 0.5 ? -1 : 1
      const x = roadX(z) + side * (ROAD_WIDTH * 0.7 + r() * 30)
      base[i * 4] = x; base[i * 4 + 1] = terrainHeight(x, z) + 0.4 + r() * 2.2; base[i * 4 + 2] = z; base[i * 4 + 3] = r() * 100
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    return { geo, base }
  }, [])
  const mat = useMemo(() => new THREE.PointsMaterial({ map: glowTexture('rgba(255,255,220,1)', 'rgba(200,255,120,0.5)'), size: 0.9, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }), [])
  useFrame((s) => {
    const k = activeSurprises.has('fireflies') ? smoothstep(-4, -10, env.sun.elevation) : 0
    mat.opacity = Math.min(1, (mat.opacity ?? 0) + ((k - mat.opacity) * 0.05))
    ref.current.visible = mat.opacity > 0.01
    if (!ref.current.visible) return
    const t = s.clock.elapsedTime
    const p = geo.getAttribute('position') as THREE.BufferAttribute, c = geo.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < N; i++) {
      const ph = base[i * 4 + 3]
      p.setXYZ(i, base[i * 4] + Math.sin(t * 0.3 + ph) * 1.5, base[i * 4 + 1] + Math.sin(t * 0.7 + ph * 2) * 0.4, base[i * 4 + 2] + Math.cos(t * 0.25 + ph) * 1.5)
      const blink = Math.max(0, Math.sin(t * 1.7 + ph * 3)) ** 3
      c.setXYZ(i, 0.9 * blink * 2, 1.0 * blink * 2, 0.45 * blink * 2)
    }
    p.needsUpdate = true; c.needsUpdate = true
  })
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />
}

/** Meteor streaks across the night sky (frequent during the "流星雨" combo, rare otherwise). */
function Meteors() {
  const env = useEnv()
  const COUNT = 8
  const group = useRef<THREE.Group>(null!)
  const state = useMemo(() => Array.from({ length: COUNT }, () => ({ t: 1, dur: 1, from: new THREE.Vector3(), dir: new THREE.Vector3() })), [])
  const mat = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 8
    const g = cv.getContext('2d')!
    const grd = g.createLinearGradient(0, 0, 128, 0)
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.85, 'rgba(220,235,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,1)')
    g.fillStyle = grd; g.fillRect(0, 2, 128, 4)
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide })
  }, [])
  const r = useMemo(() => rng(7), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const night = smoothstep(-5, -12, env.sun.elevation) * (1 - env.weather.cover)
    const rate = activeSurprises.has('meteors') ? 1.6 : env.weather.cover < 0.1 ? 0.06 : 0
    group.current.children.forEach((m, i) => {
      const st = state[i]
      st.t += dt / st.dur
      if (st.t >= 1 && night > 0.2 && r() < rate * dt) {
        st.t = 0; st.dur = 0.7 + r() * 0.8
        st.from.set(-500 + r() * 1000, 260 + r() * 200, -700 - r() * 300)
        st.dir.set(-0.6 - r() * 0.6, -0.45 - r() * 0.3, 0.1).normalize()
      }
      m.visible = st.t < 1
      if (!m.visible) return
      const len = 140
      m.position.copy(st.from).addScaledVector(st.dir, st.t * 500)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), st.dir)
      m.scale.set(len * Math.sin(st.t * Math.PI), 2.2, 1)
    })
    mat.opacity = night
  })
  return (
    <group ref={group}>
      {state.map((_, i) => <mesh key={i} material={mat} visible={false}><planeGeometry args={[1, 1]} /></mesh>)}
    </group>
  )
}

export function NightMagic() {
  return (<><Fireflies /><Meteors /></>)
}
