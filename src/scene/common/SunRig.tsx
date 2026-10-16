import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useWorld } from '../../state/worldStore'
import { sunAt } from '../../world/sun'
import { sampleLighting } from '../../world/palette'
import { useEnv, useStyleDef } from './EnvContext'

const FOCUS = new THREE.Vector3(-4, 0, -55)
const moonDir = new THREE.Vector3()

/** Drives sun/moon light, sky-fill light and fog from the (smoothed) time of day. */
export function SunRig() {
  const env = useEnv()
  const style = useStyleDef()
  const light = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const { scene, gl } = useThree()

  useEffect(() => {
    scene.fog = new THREE.FogExp2('#cfe0ee', style.fogDensity)
    gl.toneMappingExposure = style.exposure
    light.current.target.position.copy(FOCUS)
    scene.add(light.current.target)
    return () => { scene.fog = null }
  }, [scene, gl, style])

  useFrame((_, dt) => {
    const target = useWorld.getState().time
    let diff = target - env.time
    if (diff > 12) diff -= 24
    if (diff < -12) diff += 24
    env.time = (env.time + diff * (1 - Math.exp(-Math.min(dt, 0.1) * 7)) + 24) % 24
    Object.assign(env.sun, sunAt(env.time, env.sun.dir))
    const L = sampleLighting(style.lightKeys, env.sun.elevation, env.light)

    const useMoon = env.sun.elevation < -3
    const d = useMoon ? sunAt(env.time + 12, moonDir).dir : env.sun.dir
    // keep the moon reasonably high so night still has readable shadows
    if (useMoon) { d.y = Math.max(d.y, 0.55); d.normalize() }
    if (import.meta.env.DEV) (window as unknown as { __env: unknown }).__env = env
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
    fog.density = style.fogDensity * (1 + env.sun.golden * 0.35 + env.sun.night * 0.2)
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
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-radius={style.shadowRadius ?? 3}
      />
      <hemisphereLight ref={hemi} />
    </>
  )
}
