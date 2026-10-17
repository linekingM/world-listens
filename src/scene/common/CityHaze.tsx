import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useEnv } from './EnvContext'

/** Aerial-perspective veil in front of the distant city: a soft band of sunlit haze hugging the ground. */
export function CityHaze() {
  const env = useEnv()
  const scene = useThree((s) => s.scene)
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uCol: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uA: { value: 0.5 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform vec3 uSun; uniform float uA; uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float v = pow(1.0 - vUv.y, 1.6);
        float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float wisp = 0.75 + 0.25 * n(vec2(vUv.x * 9.0 + uTime * 0.02, vUv.y * 3.0));
        gl_FragColor = vec4(mix(uCol, uSun, 0.25 * (1.0 - vUv.y)), v * side * wisp * uA);
      }`,
  }), [])
  useFrame((s) => {
    const fog = scene.fog as THREE.FogExp2 | null
    if (fog) mat.uniforms.uCol.value.copy(fog.color)
    mat.uniforms.uSun.value.copy(env.light.sun)
    mat.uniforms.uTime.value = s.clock.elapsedTime
    mat.uniforms.uA.value = (0.12 + env.sun.golden * 0.18 + env.weather.mist * 0.45) * (1 - env.sun.night * 0.55)
  })
  return (
    <group>
      <mesh position={[0, 30, -300]} material={mat} renderOrder={1}><planeGeometry args={[760, 72]} /></mesh>
      <mesh position={[0, 46, -420]} material={mat} renderOrder={1}><planeGeometry args={[1000, 110]} /></mesh>
    </group>
  )
}
