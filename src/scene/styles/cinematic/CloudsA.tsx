import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Cloud, Clouds, Html } from '@react-three/drei'
import { cloudSea, horizonClouds, type CloudSpec } from '../../../world/layout'
import { useEnv } from '../../common/EnvContext'
import { useWorld } from '../../../state/worldStore'
import type { CloudObject } from '../../../state/types'
import { beginDrag, occludedByGround } from '../../systems/InteractionController'
import { roamTouch } from '../../systems/interaction'
import { cloudHitMat } from '../../objects/WorldObjects'
import { overlayRef } from '../../../ui/overlay'
import { CloudActions, useIsCompact } from '../../../ui/SelectionActions'
import { rng } from '../../../lib/random'
import { afterglowRgb, cloudAfterglow } from '../../../world/sunLook'

const WHITE = new THREE.Color('#ffffff'), GREY = new THREE.Color('#9aa6b4')
const WARM = new THREE.Color(), NIGHT = new THREE.Color('#6a7aa0')
const hitGeo = new THREE.SphereGeometry(1, 12, 8)
const DRIFT_SPAN = 520
const DRIFT_SPEED = 2.4

/** Shared ambient drift (metres); AmbientDay reads this each frame so React props stay stable. */
const ambientDrift = { x: 0 }

function gatherSpecs(day: number): CloudSpec[] {
  const r = rng(555 + day * 4337)
  const out: CloudSpec[] = []
  const n = 5 + Math.floor(r() * 5)
  for (let i = 0; i < n; i++) {
    out.push({
      pos: [-200 + i * (400 / Math.max(n - 1, 1)) + r() * 24, 55 + r() * 40, -100 - r() * 200],
      scale: 0.9 + r() * 1.0,
      seed: 90 + day * 40 + i,
    })
  }
  return out
}

/** 0 = fully today, 1 = fully tomorrow; blends across midnight (22:00 → 02:00). */
function midnightFade(t: number) {
  if (t >= 22) return (t - 22) / 4
  if (t < 2) return (t + 2) / 4
  return 0
}

function CloudToolbar({ c, y }: { c: CloudObject; y: number }) {
  const compact = useIsCompact()
  if (compact) return null
  return (
    <Html position={[0, y, 0]} center portal={overlayRef as React.MutableRefObject<HTMLElement>} zIndexRange={[30, 10]}>
      <div className="obj-toolbar glass" data-testid="cloud-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <CloudActions cloud={c} />
      </div>
    </Html>
  )
}

function HeroCloud({ c, selected }: { c: CloudObject; selected: boolean }) {
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const st = useWorld.getState()
    if (st.placing || e.button !== 0 || roamTouch(e)) return
    if (occludedByGround(e.ray, e.distance)) return
    st.select(c.id)
    beginDrag(e, 'cloud', c.id, c.pos, c.pos[1])
  }
  return (
    <group position={c.pos}>
      <Cloud
        seed={c.seed + 1}
        bounds={[46 * c.scale, 7 * c.scale, 14 * c.scale]}
        segments={Math.round(26 + c.scale * 8)}
        volume={26 * c.scale}
        smallestVolume={0.4}
        concentrate="inside"
        growth={3}
        speed={0.08}
        fade={10}
        opacity={0.8}
        color="#ffffff"
      />
      <mesh
        geometry={hitGeo}
        material={cloudHitMat}
        scale={[30 * c.scale, 9 * c.scale, 12 * c.scale]}
        onPointerDown={onDown}
        onPointerOver={(e) => { if (!occludedByGround(e.ray, e.distance)) { e.stopPropagation(); document.body.style.cursor = 'grab' } }}
        onPointerOut={() => { document.body.style.cursor = '' }}
      />
      {selected && <CloudToolbar c={c} y={12 * c.scale + 4} />}
    </group>
  )
}

function GatherCloud({ spec, index }: { spec: CloudSpec; index: number }) {
  const env = useEnv()
  const g = useRef<THREE.Group>(null!)
  useFrame(() => {
    const k = THREE.MathUtils.smoothstep(env.weather.cover, 0.35 + index * 0.05, 0.75 + index * 0.025)
    g.current.scale.setScalar(Math.max(0.001, k))
    g.current.visible = k > 0.01
  })
  return (
    <group ref={g} position={spec.pos}>
      <Cloud seed={spec.seed} bounds={[50 * spec.scale, 8 * spec.scale, 18 * spec.scale]} segments={28} volume={28 * spec.scale} smallestVolume={0.4} concentrate="inside" growth={3} speed={0.1} fade={10} opacity={0.85} color="#ffffff" />
    </group>
  )
}

/** One day's ambient bank (horizon + sea + weather gather). */
function AmbientDay({ day, opacity }: { day: number; opacity: number }) {
  const horizon = useMemo(() => horizonClouds(day), [day])
  const sea = useMemo(() => cloudSea(day), [day])
  const gather = useMemo(() => gatherSpecs(day), [day])
  const g = useRef<THREE.Group>(null!)
  const op = useRef(opacity)
  op.current = opacity
  useFrame(() => {
    if (!g.current) return
    g.current.position.x = ambientDrift.x
    const a = op.current
    g.current.visible = a > 0.02
    g.current.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined
      if (!m || !('opacity' in m)) return
      if (m.userData.baseOp == null) m.userData.baseOp = m.opacity || 0.8
      m.transparent = true
      m.depthWrite = false
      m.opacity = a * m.userData.baseOp
    })
  })
  return (
    <group ref={g}>
      {horizon.map((c, i) => (
        <Cloud key={'h' + day + '-' + i} seed={c.seed + 1} position={c.pos} bounds={[46 * c.scale, 7 * c.scale, 14 * c.scale]} segments={Math.round(30 + c.scale * 10)} volume={26 * c.scale} smallestVolume={0.4} concentrate="inside" growth={3} speed={0.08} fade={10} opacity={0.8} color="#ffffff" />
      ))}
      {sea.map((c, i) => (
        <Cloud key={'s' + day + '-' + i} seed={c.seed} position={c.pos} bounds={[80 * c.scale, 3 * c.scale, 34 * c.scale]} segments={30} volume={30 * c.scale} smallestVolume={0.5} concentrate="outside" growth={4} speed={0.05} fade={30} opacity={0.75} color="#ffffff" />
      ))}
      {gather.map((c, i) => <GatherCloud key={'g' + day + '-' + i} spec={c} index={i} />)}
    </group>
  )
}

/**
 * Billboard puffs have no stable "bottom" in UV (they spin). Mark the world-down
 * side of each sprite and the side facing the sun, and remember where the puff sits.
 * drei's CloudMaterial replaces onBeforeCompile, so this wraps that hook.
 */
function patchCloudAfterglow(m: THREE.MeshLambertMaterial) {
  if (m.userData.afterglow) return
  m.userData.afterglow = true
  const prev = m.onBeforeCompile.bind(m)
  const prevKey = m.customProgramCacheKey.bind(m)
  m.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer)
    shader.uniforms.uGlow = { value: 0 }
    shader.uniforms.uGlowCol = { value: new THREE.Color('#ffb15a') }
    shader.uniforms.uSunW = { value: new THREE.Vector3(0, 1, 0) }
    shader.vertexShader = `uniform vec3 uSunW;\nvarying float vAlongUp;\nvarying float vSunAlong;\nvarying vec3 vCloudWp;\n` + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      'vOpacity = cloudOpacity;',
      `vOpacity = cloudOpacity;
       {
         mat3 im = mat3(1.0);
         #ifdef USE_INSTANCING
           im = mat3(instanceMatrix);
         #endif
         vec2 local = transformed.xy;
         float ll = length(local);
         vec2 upG = vec2(im[0].y, im[1].y);
         float ug = length(upG);
         vAlongUp = (ll > 1e-4 && ug > 1e-4) ? dot(local / ll, upG / ug) : 0.0;
         vec2 sunG = vec2(0.0);
         vec2 sh = uSunW.xz;
         float shl = length(sh);
         if (shl > 1e-4) {
           vec3 s = vec3(sh.x / shl, 0.0, sh.y / shl);
           sunG = vec2(dot(im[0], s), dot(im[1], s));
         }
         float sg = length(sunG);
         vSunAlong = (ll > 1e-4 && sg > 1e-4) ? dot(local / ll, sunG / sg) : 0.0;
         vec4 center = vec4(0.0, 0.0, 0.0, 1.0);
         #ifdef USE_INSTANCING
           center = instanceMatrix * center;
         #endif
         vCloudWp = (modelMatrix * center).xyz;
       }`,
    )
    shader.fragmentShader = `uniform float uGlow; uniform vec3 uGlowCol; uniform vec3 uSunW;\nvarying float vAlongUp; varying float vSunAlong; varying vec3 vCloudWp;\n` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4(outgoingLight, diffuseColor.a * vOpacity);',
      `{
         vec3 glowLit = outgoingLight;
         float under = smoothstep(0.25, -0.7, vAlongUp);
         float sunSide = smoothstep(-0.2, 0.7, vSunAlong);
         vec2 cxz = vCloudWp.xz;
         vec2 sxz = uSunW.xz;
         float cl = length(cxz);
         float sl = length(sxz);
         float align = (cl > 1.0 && sl > 1e-4) ? dot(cxz / cl, sxz / sl) : 0.0;
         float place = smoothstep(-0.35, 0.55, align);
         float glowK = uGlow * (0.55 + 0.45 * place) * (0.18 + 0.82 * under) * (0.35 + 0.65 * sunSide);
         glowLit = mix(glowLit, uGlowCol, clamp(glowK, 0.0, 0.84));
         gl_FragColor = vec4(glowLit, diffuseColor.a * vOpacity);
       }`,
    )
    m.userData.shader = shader
  }
  m.customProgramCacheKey = () => prevKey() + '|afterglow'
  m.needsUpdate = true
}

/** Soft lit clouds: continuous drift, time-of-day tint, layout reseeded each day with a midnight crossfade. */
export function CloudsA() {
  const env = useEnv()
  const day = useWorld((s) => s.day ?? 0)
  const time = useWorld((s) => s.time)
  const clouds = useWorld((s) => s.clouds)
  const selectedId = useWorld((s) => s.selectedId)
  const heroes = useRef<THREE.Group>(null!)
  const root = useRef<THREE.Group>(null!)
  const tint = useMemo(() => new THREE.Color(), [])
  const drift = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    // always drift — independent of time-of-day playback / pause
    drift.current = (drift.current + dt * DRIFT_SPEED) % DRIFT_SPAN
    ambientDrift.x = drift.current - DRIFT_SPAN * 0.35

    const L = env.light
    const cover = env.weather.cover
    const dayAmt = env.sun.day, golden = env.sun.golden, night = env.sun.night
    const glow = cloudAfterglow(env.sun.elevation, env.time)
    const [gr, gg, gb] = afterglowRgb(env.sun.elevation)
    tint.copy(WHITE)
      .lerp(L.sun, 0.15 + golden * 0.55)
      .lerp(L.hemiSky, night * 0.55 + cover * 0.2)
      .lerp(GREY, cover * 0.4 * dayAmt)
      .lerp(L.fog, env.weather.mist * 0.5)
      .lerp(NIGHT, night * 0.35)
    const emis = (0.22 + dayAmt * (0.38 + (1 - golden) * 0.2) + golden * 0.12)
      * (1 - cover * 0.3) * (1 - env.weather.mist * 0.35) * (1 - night * 0.72)
    root.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined
      if (!m || !('emissive' in m)) return
      if (m.userData.baseOp == null) m.userData.baseOp = m.opacity || 0.8
      patchCloudAfterglow(m)
      const sh = m.userData.shader as {
        uniforms: { uSunW: { value: THREE.Vector3 }; uGlow: { value: number }; uGlowCol: { value: THREE.Color } }
      } | undefined
      if (sh) {
        // Real sun azimuth, including after the scene light has flipped to the moon.
        sh.uniforms.uSunW.value.copy(env.sun.dir)
        sh.uniforms.uGlow.value = glow
        sh.uniforms.uGlowCol.value.setRGB(gr, gg, gb)
      }
      m.color.copy(tint)
      m.emissive.copy(tint).multiplyScalar(emis)
        .add(WARM.copy(L.sun).multiplyScalar(golden * 0.28 * (1 - cover) * (1 - night)))
    })
  })

  const fade = midnightFade(time)
  const showA = time >= 22 ? day : time < 2 ? Math.max(0, day - 1) : day
  const showB = time >= 22 ? day + 1 : time < 2 ? day : day
  const cross = fade > 0.001 && showA !== showB

  return (
    <group ref={root}>
      <Clouds texture={`${import.meta.env.BASE_URL}tex/cloud.png`} material={THREE.MeshLambertMaterial} limit={1800} frustumCulled={false}>
        <AmbientDay day={showA} opacity={cross ? 1 - fade : 1} />
        {cross && <AmbientDay day={showB} opacity={fade} />}
        <group ref={heroes}>
          {clouds.map((c) => <HeroCloud key={c.id} c={c} selected={c.id === selectedId} />)}
        </group>
      </Clouds>
    </group>
  )
}
