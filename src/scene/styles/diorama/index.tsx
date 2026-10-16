import * as THREE from 'three'
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, SMAA, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { StyleDef, MaterialRole } from '../types'
import { paletteC, lightKeysC } from './palette'
import { GradientSky } from '../../common/GradientSky'
import { PuffyClouds } from '../../common/PuffyClouds'

function makeMaterial(role: MaterialRole): THREE.Material {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: role === 'city' ? 0.7 : 0.92, metalness: 0 })
}

function SkyC() {
  return <GradientSky sunSize={3.6} sunSoftness={0.02} sunPower={1.8} paint={0} bands={7} glow="#ffb49a" starDensity={0.994} gradientPower={0.3} />
}
function CloudsC() {
  return <PuffyClouds detail={1} flat steps={3} rim={0.35} shadowTint="#c4bff0" lumps={5} scale={0.9} />
}
function EffectsC() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <TiltShift2 blur={0.17} taper={0.65} start={[0, 0.45]} end={[1, 0.45]} samples={10} />
      <Bloom mipmapBlur luminanceThreshold={0.95} intensity={0.3} radius={0.5} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <HueSaturation saturation={0.16} />
      <BrightnessContrast contrast={0.12} brightness={0.02} />
      <Vignette offset={0.45} darkness={0.18} />
      <SMAA />
    </EffectComposer>
  )
}

export const styleC: StyleDef = {
  id: 'c',
  name: '微缩模型',
  subtitle: 'Tilt-shift Diorama',
  lowPoly: true,
  palette: paletteC,
  lightKeys: lightKeysC,
  fogDensity: 0.00045,
  exposure: 1.0,
  camera: { position: [66, 54, 96], target: [-8, 20, -110], fov: 34 },
  makeMaterial,
  Sky: SkyC,
  Clouds: CloudsC,
  Effects: EffectsC,
  shadowMapSize: 2048,
}
