import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEnv } from './EnvContext'
import { activeSurprises } from '../../state/surprises'
import { rng, smoothstep } from '../../lib/random'
import { ROAD_END, ROAD_START, ROAD_WIDTH, roadX, terrainHeight } from '../../world/layout'
import { useWorld } from '../../state/worldStore'

function glowTexture(inner: string, outer: string) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const g = cv.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, inner); grd.addColorStop(0.25, outer); grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(cv)
}

/** tonight's firefly mood, rolled once per dusk and shared by both layers */
const tonight = { stamp: -1, density: 0, seed: 0 }
let duskCount = 0, lastNight = false
function rollTonight(isNight: boolean, r: () => number) {
  if (isNight && !lastNight) duskCount++
  lastNight = isNight
  if (tonight.stamp === duskCount) return
  tonight.stamp = duskCount
  // sometimes none (35%), sometimes a few, sometimes many
  tonight.density = r() < 0.35 ? 0 : 0.15 + Math.pow(r(), 0.7) * 0.85
  tonight.seed = r() * 100
}

const FN = 180, CLUSTERS = 7
const FWD = new THREE.Vector3()

/**
 * Fireflies on some nights only. Each dusk rolls this night's mood: often none, sometimes a few, sometimes many
 * (the 萤火之夜 surprise always brings a rich night). They gather in drifting clusters over the meadow beside the
 * path and around the camera (orbit / roam / character), each cluster fading in and out on its own; far ones
 * fade with distance, so there is no edge to the swarm.
 */
function NearFireflies() {
  const env = useEnv()
  const ref = useRef<THREE.Points>(null!)
  const r = useMemo(() => rng(42), [])
  const st = useMemo(() => ({
    night: false, density: 0, shown: 0,
    clusters: Array.from({ length: CLUSTERS }, () => ({ x: 0, z: 0, life: 0, dur: 1, vx: 0, vz: 0 })),
    off: Float32Array.from({ length: FN * 4 }, () => r()),
  }), [r])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FN * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FN * 3), 3))
    return g
  }, [])
  const mat = useMemo(() => new THREE.PointsMaterial({ map: glowTexture('rgba(255,255,220,1)', 'rgba(200,255,120,0.5)'), size: 0.75, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }), [])
  // a new cluster spot: meadow beside the path somewhere in front of / around the camera, never on the road
  const place = (c: (typeof st.clusters)[number], cam: THREE.Vector3) => {
    const d = 10 + r() * 70, a = (r() - 0.5) * 2.2
    const fx = FWD.x * Math.cos(a) - FWD.z * Math.sin(a), fz = FWD.x * Math.sin(a) + FWD.z * Math.cos(a)
    c.x = cam.x + fx * d; c.z = cam.z + fz * d
    const rx = roadX(c.z), side = c.x < rx ? -1 : 1
    if (Math.abs(c.x - rx) < ROAD_WIDTH * 0.6 + 4) c.x = rx + side * (ROAD_WIDTH * 0.6 + 4 + r() * 10)
    c.life = 0; c.dur = 25 + r() * 40
    c.vx = (r() - 0.5) * 0.6; c.vz = (r() - 0.5) * 0.6
  }
  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const dark = smoothstep(-4, -10, env.sun.elevation) * (1 - smoothstep(0.4, 0.8, env.weather.cover))
    const isNight = env.sun.elevation < -4
    const cam = s.camera.position
    s.camera.getWorldDirection(FWD); FWD.y = 0
    if (FWD.lengthSq() < 1e-6) FWD.set(0, 0, -1)
    FWD.normalize()
    rollTonight(isNight, r)
    if (isNight && !st.night) {
      // dusk: tonight's roll is shared with the path layer; scatter the clusters fresh
      rollTonight(isNight, r)
      st.density = tonight.density
      st.clusters.forEach((c) => { place(c, cam); c.life = r() * c.dur * 0.5 })
    }
    st.night = isNight
    const want = (activeSurprises.has('fireflies') ? Math.max(st.density, 1) : st.density) * dark
    st.shown += (want - st.shown) * (1 - Math.exp(-dt * 0.5))
    ;(window as unknown as { __fireflies: number }).__fireflies = st.shown
    ref.current.visible = st.shown > 0.01
    if (!ref.current.visible) return
    const t = s.clock.elapsedTime
    // clusters drift, age and relocate when spent or left far behind
    for (const c of st.clusters) {
      c.life += dt; c.x += c.vx * dt; c.z += c.vz * dt
      // spent, beyond the distance fade, or well behind the camera: move it somewhere ahead (never visibly)
      const ahead = (c.x - cam.x) * FWD.x + (c.z - cam.z) * FWD.z
      if (c.life > c.dur || Math.hypot(c.x - cam.x, c.z - cam.z) > 108 || ahead < -25) place(c, cam)
    }
    const p = geo.getAttribute('position') as THREE.BufferAttribute, col = geo.getAttribute('color') as THREE.BufferAttribute
    const active = Math.round(FN * Math.min(1, st.shown))
    for (let i = 0; i < FN; i++) {
      const c = st.clusters[i % CLUSTERS], o = st.off
      const ph = o[i * 4 + 3] * 100
      const rad = 3 + o[i * 4] * 9, ang = o[i * 4 + 1] * 6.283
      const x = c.x + Math.cos(ang) * rad + Math.sin(t * 0.3 + ph) * 1.5
      const z = c.z + Math.sin(ang) * rad + Math.cos(t * 0.25 + ph) * 1.5
      p.setXYZ(i, x, terrainHeight(x, z) + 0.4 + o[i * 4 + 2] * 2.2 + Math.sin(t * 0.7 + ph * 2) * 0.4, z)
      // each cluster fades in/out over its life; far fireflies fade before they get small, so no swarm edge
      const life = smoothstep(0, 5, c.life) * (1 - smoothstep(c.dur - 6, c.dur, c.life))
      const far = 1 - smoothstep(55, 105, Math.hypot(x - cam.x, z - cam.z))
      const blink = 0.12 + 0.88 * Math.max(0, Math.sin(t * 1.3 + ph * 3)) ** 4
      const k = i < active ? blink * life * far * 2 * Math.min(1, st.shown * 1.5) : 0
      col.setXYZ(i, 0.9 * k, 1.0 * k, 0.45 * k)
    }
    p.needsUpdate = true; col.needsUpdate = true
  })
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} raycast={() => null} />
}

const FCOUNT = { high: 900, medium: 600, low: 260 } as const
const PFWD = new THREE.Vector3()

/**
 * Fireflies on some nights only, in world space: most line both edges of the path all the way into the distance,
 * in patchy stretches that change from night to night; a sparse few over the open meadow, none placed in the
 * forests. Size attenuation + a gentle brightness falloff with distance make far ones tiny and dim, never cut off.
 * Each dusk rolls tonight's mood (sometimes none, sometimes a few, sometimes many); 萤火之夜 always brings plenty.
 */
function PathFireflies() {
  const env = useEnv()
  const quality = useWorld((s) => s.quality)
  const N = FCOUNT[quality]
  const ref = useRef<THREE.Points>(null!)
  const r = useMemo(() => rng(42), [])
  const { geo, base } = useMemo(() => {
    const rr = rng(42)
    // per firefly: x, y, z, phase, along-path coordinate (for patchiness), meadow flag
    const base = new Float32Array(N * 6)
    for (let i = 0; i < N; i++) {
      let x: number, z: number, y: number
      const meadow = rr() < 0.14
      if (!meadow) {
        z = ROAD_START - rr() * (ROAD_START - ROAD_END + 8)
        const side = rr() < 0.5 ? -1 : 1
        x = roadX(z) + side * (ROAD_WIDTH / 2 + 0.8 + Math.pow(rr(), 1.6) * 7)
        y = 0.3 + rr() * 1.6
      } else {
        z = 40 - rr() * 300
        const side = rr() < 0.5 ? -1 : 1
        x = roadX(z) + side * (16 + rr() * 90)
        y = 0.5 + rr() * 2.4
      }
      base.set([x, terrainHeight(x, z) + y, z, rr() * 100, z, meadow ? 1 : 0], i * 6)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    return { geo, base }
  }, [N])
  useEffect(() => () => geo.dispose(), [geo])
  const mat = useMemo(() => new THREE.PointsMaterial({ map: glowTexture('rgba(255,255,220,1)', 'rgba(200,255,120,0.5)'), size: 0.75, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }), [])
  const st = useRef({ night: false, density: 0, shown: 0, seed: 0 })
  useFrame((s, rawDt) => {
    const p0 = st.current
    const dark = smoothstep(-4, -10, env.sun.elevation) * (1 - smoothstep(0.4, 0.8, env.weather.cover))
    const isNight = env.sun.elevation < -4
    rollTonight(isNight, r)
    if (isNight && !p0.night) { p0.density = tonight.density; p0.seed = tonight.seed }
    p0.night = isNight
    const want = (activeSurprises.has('fireflies') ? Math.max(p0.density, 1) : p0.density) * dark
    const dt = Math.min(rawDt, 0.1)
    p0.shown += (want - p0.shown) * (1 - Math.exp(-dt * 0.5))
    ref.current.visible = p0.shown > 0.01
    if (!ref.current.visible) return
    const t = s.clock.elapsedTime
    const cam = s.camera.position
    s.camera.getWorldDirection(PFWD)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute, col = geo.getAttribute('color') as THREE.BufferAttribute
    // patchy stretches: a slow 1-D noise along the road decides where tonight's fireflies gather
    const thr = 1 - Math.min(1, p0.shown) * 1.1
    for (let i = 0; i < N; i++) {
      const o = i * 6, ph = base[o + 3]
      const x = base[o] + Math.sin(t * 0.3 + ph) * 1.2, z = base[o + 2] + Math.cos(t * 0.25 + ph) * 1.2
      const y = base[o + 1] + Math.sin(t * 0.7 + ph * 2) * 0.35
      pos.setXYZ(i, x, y, z)
      const along = base[o + 4] * 0.035 + p0.seed + t * 0.02
      const patch = 0.5 + 0.3 * Math.sin(along) + 0.2 * Math.sin(along * 2.7 + 1.3)
      const on = smoothstep(thr - 0.12, thr + 0.12, base[o + 5] ? patch * 0.55 : patch)
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      // gentle falloff (no radius): far ones dim, size attenuation makes them tiny; skip the ones behind the camera
      const fall = 1 / (1 + d / 110)
      const front = dx * PFWD.x + dy * PFWD.y + dz * PFWD.z > -5 ? 1 : 0
      const blink = 0.12 + 0.88 * Math.max(0, Math.sin(t * 1.3 + ph * 3)) ** 4
      const k = on * blink * fall * front * smoothstep(30, 75, d) * 2.2 * Math.min(1, p0.shown * 1.5)
      col.setXYZ(i, 0.9 * k, 1.0 * k, 0.45 * k)
    }
    pos.needsUpdate = true; col.needsUpdate = true
  })
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} raycast={() => null} />
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
      const len = 90
      m.position.copy(st.from).addScaledVector(st.dir, st.t * 500)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), st.dir)
      m.scale.set(len * Math.sin(st.t * Math.PI), 0.9, 1)
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
  return (<><NearFireflies /><PathFireflies /><Meteors /></>)
}
