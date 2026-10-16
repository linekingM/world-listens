import * as THREE from 'three'
import { MathUtils, Vector3 } from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OC } from 'three-stdlib'
import { useStyleDef } from './EnvContext'
import { useWorld } from '../../state/worldStore'
import { terrainHeight } from '../../world/layout'

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/** Orbit / zoom / pan within comfortable limits around the hero framing, with a smooth reset. */
export function CameraRig() {
  const style = useStyleDef()
  const ctl = useRef<OC>(null!)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const aspect = useThree((s) => s.size.width / s.size.height)
  const home = useRef({ pos: new Vector3(), target: new Vector3() })
  const tween = useRef<{ t: number; fromP: Vector3; fromT: Vector3 } | null>(null)
  const resetTick = useWorld((s) => s.cameraResetTick)

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
    home.current.pos.copy(pos)
    home.current.target.copy(target)
    camera.position.copy(pos)
    camera.fov = fov
    camera.updateProjectionMatrix()
    ctl.current?.target.copy(target)
    ctl.current?.update()
  }, [camera, style, aspect])

  useEffect(() => {
    if (!resetTick || !ctl.current) return
    // drop any residual damping / zoom momentum so the camera lands exactly on its home framing
    ctl.current.enableDamping = false
    ctl.current.update()
    tween.current = { t: 0, fromP: camera.position.clone(), fromT: ctl.current.target.clone() }
  }, [resetTick, camera])

  useFrame((_, dt) => {
    const c = ctl.current
    if (tween.current && c) {
      const tw = tween.current
      tw.t = Math.min(1, tw.t + dt / 1.4)
      const k = ease(tw.t)
      camera.position.lerpVectors(tw.fromP, home.current.pos, k)
      c.target.lerpVectors(tw.fromT, home.current.target, k)
      c.update()
      if (tw.t >= 1) { tween.current = null; c.enableDamping = true }
    }
    // never dip below the terrain
    const g = terrainHeight(camera.position.x, camera.position.z) + 2.5
    if (camera.position.y < g) camera.position.y = g
    if (c) {
      c.target.x = MathUtils.clamp(c.target.x, -200, 200)
      c.target.z = MathUtils.clamp(c.target.z, -330, 60)
      c.target.y = MathUtils.clamp(c.target.y, 0, 80)
    }
    ;(window as unknown as { __cam: unknown }).__cam = camera
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
      screenSpacePanning={false}
    />
  )
}
