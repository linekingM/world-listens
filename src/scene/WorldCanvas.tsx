import { Suspense } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { useWorld } from '../state/worldStore'
import { sharedEnv } from './common/sharedEnv'
import { EnvContext, StyleContext } from './common/EnvContext'
import { SunRig } from './common/SunRig'
import { WorldContent } from './common/WorldContent'
import { CameraRig } from './common/CameraRig'
import { STYLES } from './styles'
import { WorldObjects } from './objects/WorldObjects'
import { InteractionController } from './systems/InteractionController'
import { SunHandle } from './common/SunHandle'
import { Grass } from './common/Grass'
import { GravityFX } from './common/GravityFX'
import { CityHaze } from './common/CityHaze'

const NO_CLOUDS = new URLSearchParams(window.location.search).has('noclouds')

export function WorldCanvas() {
  const styleId = useWorld((s) => s.style)
  const style = STYLES[styleId]
  const env = sharedEnv
  const { Sky, Clouds, Effects, Extras } = style
  return (
    <Canvas
      key={styleId}
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 2]}
      camera={{ position: style.camera.position, fov: style.camera.fov, near: 0.5, far: 6000 }}
      gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, stencil: false }}
    >
      <EnvContext.Provider value={env}>
        <StyleContext.Provider value={style}>
          <SunRig />
          <Sky />
          {!NO_CLOUDS && <Suspense fallback={null}><Clouds /></Suspense>}
          <WorldContent />
          <Grass />
          {styleId === 'a' && <CityHaze />}
          <WorldObjects />
          <GravityFX />
          <SunHandle />
          <InteractionController />
          {Extras && <Extras />}
          <CameraRig />
          <Effects />
        </StyleContext.Provider>
      </EnvContext.Provider>
    </Canvas>
  )
}
