import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { SunShaftsEffect } from './SunShafts'
import { BlendFunction, Effect, EffectPass, ToneMappingMode } from 'postprocessing'
import { sharedEnv as env } from '../../common/sharedEnv'
import { smoothstep } from '../../../lib/random'
import { useWorld } from '../../../state/worldStore'
import { QSPEC } from '../../../state/quality'

/**
 * First pass after the scene render: replace NaN/Inf (and absurd half-float values) before god rays and bloom read
 * the frame. A single bad pixel would otherwise be smeared by the bloom mip chain into a black half/full screen.
 */
class ScrubEffect extends Effect {
  constructor() {
    super('Scrub', /* glsl */`
      float scrub1(float v) { return (v >= 0.0 && v <= 2048.0) ? v : (v > 2048.0 ? 2048.0 : 0.0); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec4 c = inputColor;
        if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
        outputColor = vec4(scrub1(c.r), scrub1(c.g), scrub1(c.b), clamp(c.a, 0.0, 1.0));
      }`)
  }
}
function useScrubPass() {
  const camera = useThree((s) => s.camera)
  return useMemo(() => new EffectPass(camera, new ScrubEffect()), [camera])
}

const V = new THREE.Vector3()
const SHAFT_WARM = new THREE.Color(1, 0.75, 0.45)
/** Drives the light shafts: sun screen position + strength (golden hour, clear sky, sun in front of the camera). */
function useSunShafts() {
  const fx = useMemo(() => new SunShaftsEffect(), [])
  useFrame(({ camera, size }) => {
    const k = smoothstep(-1, 3, env.sun.elevation) * smoothstep(0.1, 0.5, env.sun.golden) * (1 - smoothstep(0.35, 0.7, env.weather.cover))
    V.copy(camera.position).addScaledVector(env.sun.dir, 1000).project(camera)
    const u = fx.uniforms
    const ahead = V.z < 1 && Number.isFinite(V.x + V.y)
    const sx = (V.x + 1) / 2, sy = (V.y + 1) / 2
    // fade as the sun leaves the frame (no pop at the edge), off when it is behind the camera
    const onScreen = ahead ? 1 - smoothstep(0.0, 0.35, Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) - 0.5) : 0
    ;(u.get('uSun')!.value as THREE.Vector2).set(ahead ? sx : 0.5, ahead ? sy : 0.5)
    u.get('uStrength')!.value = k * onScreen * 0.4
    ;(u.get('uTint')!.value as THREE.Color).copy(env.light.sun).lerp(SHAFT_WARM, 0.35)
    u.get('uAspect')!.value = size.width / Math.max(size.height, 1)
  })
  return fx
}

export function EffectsA() {
  const full = useWorld((s) => QSPEC[s.quality].post === 'full')
  const scrub = useScrubPass()
  const shafts = useSunShafts()
  if (!full) {
    // 低: no god rays / bloom / grain, keep the grade and edge smoothing
    return (
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <primitive object={scrub} dispose={null} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.32} darkness={0.34} />
        <SMAA />
      </EffectComposer>
    )
  }
  return (
    <>
      <EffectComposer multisampling={0} enableNormalPass={false} ref={(c) => { (window as unknown as { __composer: unknown }).__composer = c }}>
        <primitive object={scrub} dispose={null} />
        <primitive object={shafts} dispose={null} />
        <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.28} intensity={0.35} radius={0.55} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.32} darkness={0.34} />
        <Noise premultiply opacity={0.06} blendFunction={BlendFunction.SOFT_LIGHT} />
        <SMAA />
      </EffectComposer>
    </>
  )
}
