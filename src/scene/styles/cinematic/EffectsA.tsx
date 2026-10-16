import { useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, GodRays, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { sharedEnv as env } from '../../common/sharedEnv'
import { smoothstep } from '../../../lib/random'

const sunMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false, fog: false })

/** Light source for the god-ray pass: a sun proxy riding on the sky sphere, lit only near golden hour. */
function SunProxy({ onMesh }: { onMesh: (m: THREE.Mesh | null) => void }) {
  useFrame(({ camera }) => {
    const m = sunMat
    const k = smoothstep(-1, 3, env.sun.elevation) * smoothstep(0.1, 0.5, env.sun.golden) * (1 - smoothstep(0.35, 0.7, env.weather.cover))
    m.color.setRGB(1, 0.82, 0.58).multiplyScalar(3.2)
    const mesh = (m.userData.mesh as THREE.Mesh | undefined)
    if (mesh) { mesh.position.copy(camera.position).addScaledVector(env.sun.dir, 900); mesh.visible = k > 0.03; mesh.scale.setScalar(0.4 + k * 0.6) }
  })
  return <mesh ref={(r) => { sunMat.userData.mesh = r; onMesh(r) }} material={sunMat} frustumCulled={false} raycast={() => null}><sphereGeometry args={[17, 20, 14]} /></mesh>
}

export function EffectsA() {
  const [sun, setSun] = useState<THREE.Mesh | null>(null)
  return (
    <>
      <SunProxy onMesh={(m) => { if (m && m !== sun) setSun(m) }} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        {sun ? <GodRays sun={sun} samples={36} density={0.96} decay={0.955} weight={0.24} exposure={0.18} clampMax={1} blur /> : <></>}
        <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.25} intensity={0.45} radius={0.6} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.32} darkness={0.34} />
        <Noise premultiply opacity={0.06} blendFunction={BlendFunction.SOFT_LIGHT} />
        <SMAA />
      </EffectComposer>
    </>
  )
}
