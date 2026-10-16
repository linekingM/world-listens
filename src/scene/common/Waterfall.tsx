import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEnv } from './EnvContext'
const TMP = new THREE.Color()

/** A thin animated ribbon of water spilling off a floating island, dissolving into mist. */
export function Waterfall({ position, height = 26, width = 1.8, color = '#dff3ff', rotationY = 0 }: {
  position: [number, number, number]; height?: number; width?: number; color?: string; rotationY?: number
}) {
  const env = useEnv()
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uLight: { value: new THREE.Color(1, 1, 1) } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        p.x *= 1.0 + (1.0 - uv.y) * 1.6; // spreads as it falls
        p.z += pow(1.0 - uv.y, 2.0) * 2.5;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uColor; uniform vec3 uLight;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float streaks = n(vec2(vUv.x*14.0, vUv.y*6.0 + uTime*2.6)) * 0.6 + n(vec2(vUv.x*31.0, vUv.y*12.0 + uTime*4.0))*0.4;
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        float fade = smoothstep(0.0, 0.55, vUv.y);
        float a = edge * fade * (0.35 + streaks * 0.65);
        vec3 c = uColor * uLight * (0.85 + streaks * 0.35);
        gl_FragColor = vec4(c, a * 0.85);
        #include <fog_fragment>
      }`,
  }), [color])
  useFrame((s) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime
    const L = env.light
    ;(mat.uniforms.uLight.value as THREE.Color).copy(L.hemiSky).multiplyScalar(0.6 * L.hemiI).add(TMP.copy(L.sun).multiplyScalar(L.sunI * 0.25))
  })
  return (
    <mesh position={[position[0], position[1] - height / 2, position[2]]} rotation-y={rotationY} material={mat} renderOrder={2}>
      <planeGeometry args={[width, height, 1, 16]} />
    </mesh>
  )
}
