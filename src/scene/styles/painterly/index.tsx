import * as THREE from 'three'
import { Bloom, EffectComposer, HueSaturation, SMAA, ToneMapping, Vignette, Kuwahara } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { StyleDef, MaterialRole } from '../types'
import { paletteB, lightKeysB } from './palette'
import { GradientSky } from '../../common/GradientSky'
import { PuffyClouds } from '../../common/PuffyClouds'

let ramp: THREE.DataTexture | null = null
/** Soft 4-step light ramp, linearly filtered so the steps melt into each other like gouache. */
function softRamp() {
  if (ramp) return ramp
  const v = [105, 150, 205, 240, 255]
  const data = new Uint8Array(v.length * 4)
  v.forEach((x, i) => data.set([x, x, x, 255], i * 4))
  ramp = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat)
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter
  ramp.needsUpdate = true
  return ramp
}

function makeMaterial(role: MaterialRole): THREE.Material {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() })
  if (role === 'mountain') m.gradientMap = null
  return m
}

function SkyB() {
  return <GradientSky sunSize={3.2} sunSoftness={0.5} sunPower={2.6} paint={0.06} glow="#ff9f7c" starDensity={0.995} gradientPower={0.28} />
}
function CloudsB() {
  return <PuffyClouds detail={3} flat={false} steps={0} rim={0.9} shadowTint="#9c9ee0" lumps={7} />
}
function EffectsB() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Kuwahara radius={4} sectorCount={6} />
      <Bloom mipmapBlur luminanceThreshold={0.92} intensity={0.35} radius={0.6} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <HueSaturation saturation={0.04} />
      <Vignette offset={0.35} darkness={0.3} />
      <SMAA />
    </EffectComposer>
  )
}

export const styleB: StyleDef = {
  id: 'b',
  name: '绘本手绘风',
  subtitle: 'Painted Storybook',
  lowPoly: false,
  palette: paletteB,
  lightKeys: lightKeysB,
  fogDensity: 0.0017,
  exposure: 1.0,
  camera: { position: [8, 15, 38], target: [-4, 17, -80], fov: 50 },
  makeMaterial,
  Sky: SkyB,
  Clouds: CloudsB,
  Effects: EffectsB,
  shadowMapSize: 2048,
  shadowRadius: 6,
}
