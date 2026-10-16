import type * as THREE from 'three'
import { MathUtils, Vector3 } from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OC } from 'three-stdlib'
import { useStyleDef } from './EnvContext'

/** Orbit / zoom / pan within comfortable limits around the style's hero framing. */
export function CameraRig() {
  const style = useStyleDef()
  const ctl = useRef<OC>(null!)
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / s.size.height)
  useEffect(() => {
    const pos = new Vector3(...style.camera.position)
    const target = new Vector3(...style.camera.target)
    let fov = style.camera.fov
    if (aspect < 1) {
      // portrait: keep a usable horizontal field of view and step back a little
      const h = MathUtils.degToRad(style.camera.fov * 1.6 * 0.62)
      fov = Math.min(78, MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect)))
      pos.sub(target).multiplyScalar(1.12).add(target)
      pos.y += 4
    }
    camera.position.copy(pos)
    ;(camera as THREE.PerspectiveCamera).fov = fov
    camera.updateProjectionMatrix()
    ctl.current?.target.set(...style.camera.target)
    ctl.current?.update()
  }, [camera, style, aspect])
  useFrame(() => {
    if (import.meta.env.DEV) (window as unknown as { __cam: unknown }).__cam = camera
    ;(window as unknown as { __frames: number }).__frames = ((window as unknown as { __frames: number }).__frames ?? 0) + 1
  })
  return (
    <OrbitControls
      ref={ctl}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={12}
      maxDistance={220}
      maxPolarAngle={Math.PI * 0.53}
      minPolarAngle={Math.PI * 0.18}
      rotateSpeed={0.5}
      zoomSpeed={0.7}
      panSpeed={0.6}
    />
  )
}
