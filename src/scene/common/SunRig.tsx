import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useWorld } from '../../state/worldStore'
import { sunAt } from '../../world/sun'
import { sampleLighting } from '../../world/palette'
import { useEnv, useStyleDef } from './EnvContext'
import { WEATHER_TARGETS, fxUniforms } from './env'
import { smoothstep } from '../../lib/random'

const FOCUS = new THREE.Vector3(-4, 0, -55)
const moonDir = new THREE.Vector3()
const GREY = new THREE.Color('#b9c2cc'), MIST = new THREE.Color('#e4e9ee'), NIGHT_MIST = new THREE.Color('#3a4560')
const TMP = new THREE.Color()

const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt))

/** Drives sun/moon light, sky-fill light, fog, weather blending and shared shader uniforms. */
export function SunRig() {
  const env = useEnv()
  const style = useStyleDef()
  const light = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const { scene, gl, camera } = useThree()

  useEffect(() => {
    scene.fog = new THREE.FogExp2('#cfe0ee', style.fogDensity)
    gl.toneMappingExposure = style.exposure
    light.current.target.position.copy(FOCUS)
    scene.add(light.current.target)
    return () => { scene.fog = null }
  }, [scene, gl, style])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.4)
    const st = useWorld.getState()
    // ── time (shortest way round the clock) ──
    let diff = st.time - env.time
    if (diff > 12) diff -= 24
    if (diff < -12) diff += 24
    const rate = st.timeEase === 'slow' ? 1.1 : 8
    env.time = (env.time + diff * (1 - Math.exp(-dt * rate)) + 24) % 24
    Object.assign(env.sun, sunAt(env.time, env.sun.dir))
    // ── weather & rules blend slowly for natural transitions ──
    const wt = WEATHER_TARGETS[st.weather]
    env.weather.cover = damp(env.weather.cover, wt.cover, 0.9, dt)
    env.weather.mist = damp(env.weather.mist, wt.mist, 0.9, dt)
    env.gravity = damp(env.gravity, st.gravity, 2.5, dt)
    const { cover, mist } = env.weather

    const L = sampleLighting(style.lightKeys, env.sun.elevation, env.light)
    // overcast/mist: weaker, greyer sun; brighter, flatter sky light
    L.sunI *= 1 - cover * 0.6 - mist * 0.35
    L.sun.lerp(GREY, cover * 0.35)
    L.hemiI *= 1 + cover * 0.25 + mist * 0.2
    L.hemiSky.lerp(GREY, cover * 0.3)
    // mist colour follows the light: pale silver by day, dusky rose at sunset, blue-grey at night
    const lum = L.fog.r * 0.3 + L.fog.g * 0.59 + L.fog.b * 0.11
    TMP.setRGB(lum, lum, lum).lerp(L.fog, 0.45).lerp(MIST, env.sun.day * (1 - env.sun.golden) * 0.6).lerp(NIGHT_MIST, env.sun.night * 0.6)
    L.fog.lerp(TMP, mist * 0.8).lerp(GREY, cover * 0.25 * env.sun.day)

    const useMoon = env.sun.elevation < -3
    const d = useMoon ? sunAt(env.time + 12, moonDir).dir : env.sun.dir
    if (useMoon) { d.y = Math.max(d.y, 0.55); d.normalize() }
    const l = light.current
    if (!l || !hemi.current) return
    l.position.copy(FOCUS).addScaledVector(d, 260)
    l.color.copy(L.sun)
    l.intensity = L.sunI
    hemi.current.color.copy(L.hemiSky)
    hemi.current.groundColor.copy(L.hemiGround)
    hemi.current.intensity = L.hemiI
    const fog = scene.fog as THREE.FogExp2
    fog.color.copy(L.fog)
    fog.density = style.fogDensity * (1 + env.sun.golden * 0.35 + env.sun.night * 0.2 + cover * 0.5 + mist * 1.7)

    // ── shared shader uniforms ──
    fxUniforms.uTime.value = state.clock.elapsedTime
    fxUniforms.uWind.value = 0.8 + cover * 0.8 + (1 - Math.max(0, env.gravity)) * 0.6
    fxUniforms.uSunDir.value.copy(env.sun.dir)
    fxUniforms.uSunView.value.copy(env.sun.dir).transformDirection(camera.matrixWorldInverse)
    fxUniforms.uSunCol.value.copy(L.sun)
    fxUniforms.uValley.value = 0.22 + env.sun.golden * 0.4 + env.weather.mist * 0.3 + env.sun.night * 0.1
    fxUniforms.uLeafGlow.value = smoothstep(-3, 4, env.sun.elevation) * (1 - cover * 0.75)
    fxUniforms.uGlint.value = env.sun.golden * smoothstep(-2, 2, env.sun.elevation) * (1 - cover)
    fxUniforms.uCloudShadow.value = (0.18 + cover * 0.35) * env.sun.day * (1 - mist * 0.6)
    ;(window as unknown as { __env: unknown }).__env = env
  })

  const s = style.shadowMapSize
  return (
    <>
      <directionalLight
        ref={light}
        castShadow
        shadow-mapSize={[s, s]}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
        shadow-camera-near={20}
        shadow-camera-far={600}
        shadow-bias={-0.00025}
        shadow-normalBias={0.18}
        shadow-radius={style.shadowRadius ?? 3}
      />
      <hemisphereLight ref={hemi} />
    </>
  )
}
