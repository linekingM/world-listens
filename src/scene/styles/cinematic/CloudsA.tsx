import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Cloud, Clouds } from '@react-three/drei'
import { cloudSpecs } from '../../../world/layout'
import { useEnv } from '../../common/EnvContext'
const WHITE = new THREE.Color('#ffffff')
const WARM = new THREE.Color()

/** Soft, lit volumetric-sprite clouds that pick up sun colour at golden hour. */
export function CloudsA() {
  const env = useEnv()
  const specs = useMemo(() => cloudSpecs(), [])
  const group = useRef<THREE.Group>(null!)
  const tint = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    // darker, bluer at night; warmer near golden hour
    const L = env.light
    tint.copy(L.fog).lerp(L.hemiSky, 0.3).lerp(WHITE, env.sun.day * (0.35 + (1 - env.sun.golden) * 0.4))
    group.current.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined
      if (m && 'emissive' in m) m.emissive.copy(tint).multiplyScalar(0.3 + env.sun.day * (0.3 + (1 - env.sun.golden) * 0.25)).add(WARM.copy(L.sun).multiplyScalar(env.sun.golden * 0.18))
    })
  })
  return (
    <group ref={group}>
      <Clouds texture="/tex/cloud.png" material={THREE.MeshLambertMaterial} limit={900} frustumCulled={false}>
        {specs.map((c, i) => (
          <Cloud
            key={i}
            seed={c.seed + 1}
            position={c.pos}
            bounds={[46 * c.scale, 7 * c.scale, 14 * c.scale]}
            segments={Math.round(30 + c.scale * 10)}
            volume={26 * c.scale}
            smallestVolume={0.4}
            concentrate="inside"
            growth={3}
            speed={0.08}
            fade={10}
            opacity={0.8}
            color="#ffffff"
          />
        ))}
      </Clouds>
    </group>
  )
}
