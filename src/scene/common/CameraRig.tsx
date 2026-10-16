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

export interface CamPose { pos: Vector3; target: Vector3 }
/** Imperative camera moves for UI flows (save auto-framing, load). Filled by <CameraRig/>. */
export const cameraApi = {
  getPose: (): CamPose | null => null,
  /** glide to a pose (home framing when omitted); resolves when the move ends */
  glide: (_pose?: CamPose, _seconds?: number): Promise<void> => Promise.resolve(),
}

/** Orbit / zoom / pan within comfortable limits around the hero framing, with a smooth reset. */
export function CameraRig() {
  const style = useStyleDef()
  const ctl = useRef<OC>(null!)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const aspect = useThree((s) => s.size.width / s.size.height)
  const home = useRef({ pos: new Vector3(), target: new Vector3() })
  const tween = useRef<{ t: number; fromP: Vector3; fromT: Vector3; toP: Vector3; toT: Vector3; dur: number; done?: () => void } | null>(null)
  const resetTick = useWorld((s) => s.cameraResetTick)

  useEffect(() => {
    const pos = new Vector3(...style.camera.position)
    const target = new Vector3(...style.camera.target)
    let fov = style.camera.fov
    if (aspect < 1) {
      // portrait: keep a usable horizontal field of view and step back a little
      const h = MathUtils.degToRad(style.camera.fov * 1.6 * 0.62)
      fov = Math.min(68, MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect)))
      pos.sub(target).multiplyScalar(1.1).add(target)
      pos.y += 1.5
      // look a little lower so the meadow and road fill the tall frame instead of empty sky
      target.y -= 5
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
    cameraApi.glide()
  }, [resetTick, camera])

  useEffect(() => {
    cameraApi.getPose = () => (ctl.current ? { pos: camera.position.clone(), target: ctl.current.target.clone() } : null)
    cameraApi.glide = (pose, seconds = 1.4) => new Promise<void>((resolve) => {
      const c = ctl.current
      if (!c) return resolve()
      tween.current?.done?.()
      // drop residual damping / zoom momentum so the camera lands exactly on the pose
      c.enableDamping = false
      c.update()
      tween.current = { t: 0, fromP: camera.position.clone(), fromT: c.target.clone(), toP: (pose?.pos ?? home.current.pos).clone(), toT: (pose?.target ?? home.current.target).clone(), dur: seconds, done: resolve }
    })
  }, [camera])

  useFrame((_, dt) => {
    const c = ctl.current
    if (tween.current && c) {
      const tw = tween.current
      tw.t = Math.min(1, tw.t + Math.min(dt, 0.25) / tw.dur)
      const k = ease(tw.t)
      camera.position.lerpVectors(tw.fromP, tw.toP, k)
      c.target.lerpVectors(tw.fromT, tw.toT, k)
      c.update()
      if (tw.t >= 1) { tween.current = null; c.enableDamping = true; tw.done?.() }
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
