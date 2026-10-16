import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEnv } from './EnvContext'
import { useWorld } from '../../state/worldStore'
import { beginDrag, occludedByGround } from '../systems/InteractionController'
import { interaction } from '../systems/interaction'

const DIST = 1400

/** Invisible grab handle on the sun (drag it across the sky) + a soft halo while hovered / dragged. */
export function SunHandle() {
  const env = useEnv()
  const hit = useRef<THREE.Mesh>(null!)
  const halo = useRef<THREE.Sprite>(null!)
  const hover = useRef(0)
  const haloMat = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128
    const g = cv.getContext('2d')!
    const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64)
    grd.addColorStop(0, 'rgba(255,240,210,0)'); grd.addColorStop(0.55, 'rgba(255,236,200,0.9)'); grd.addColorStop(0.62, 'rgba(255,230,190,0.25)'); grd.addColorStop(1, 'rgba(255,220,170,0)')
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
    const t = new THREE.CanvasTexture(cv)
    return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: 0 })
  }, [])
  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, fog: false }), [])
  useFrame(({ camera }, dt) => {
    const p = camera.position
    hit.current.position.copy(env.sun.dir).multiplyScalar(DIST).add(p)
    halo.current.position.copy(hit.current.position)
    const up = env.sun.elevation > -2
    hit.current.visible = up
    const target = (interaction.hoverSun || interaction.drag?.kind === 'sun') && up ? 1 : 0
    hover.current += (target - hover.current) * (1 - Math.exp(-dt * 8))
    haloMat.opacity = hover.current * 0.85
    halo.current.visible = hover.current > 0.01
  })
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (useWorld.getState().placing || e.button !== 0) return
    if (occludedByGround(e.ray, 900)) return
    beginDrag(e, 'sun', 'sun', [0, 0, 0])
  }
  return (
    <>
      <mesh
        ref={hit}
        material={hitMat}
        onPointerDown={onDown}
        onPointerOver={(e) => { e.stopPropagation(); interaction.hoverSun = true; document.body.style.cursor = 'grab' }}
        onPointerOut={() => { interaction.hoverSun = false; document.body.style.cursor = '' }}
      >
        <sphereGeometry args={[70, 16, 12]} />
      </mesh>
      <sprite ref={halo} material={haloMat} scale={[260, 260, 1]} renderOrder={10} />
    </>
  )
}
