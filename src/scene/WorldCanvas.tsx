import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { useWorld } from '../state/worldStore'
import { createEnv } from './common/env'
import { EnvContext, StyleContext } from './common/EnvContext'
import { SunRig } from './common/SunRig'
import { WorldContent } from './common/WorldContent'
import { CameraRig } from './common/CameraRig'
import { STYLES } from './styles'

const NO_CLOUDS = new URLSearchParams(window.location.search).has('noclouds')

export function WorldCanvas() {
  const styleId = useWorld((s) => s.style)
  const style = STYLES[styleId]
  const env = useMemo(() => createEnv(useWorld.getState().time), [])
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
          {Extras && <Extras />}
          <CameraRig />
          <Effects />
        </StyleContext.Provider>
      </EnvContext.Provider>
    </Canvas>
  )
}
