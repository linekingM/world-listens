import { useMemo, useRef } from 'react'
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
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSeed: { value: 0 }, uColor: { value: new THREE.Color(color) }, uLight: { value: new THREE.Color(1, 1, 1) } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        // curved sheet (open cylinder arc) that bellies outward and spreads as it falls
        float fall = 1.0 - uv.y;
        p.xz *= 1.0 + fall * 1.3;
        p.z += pow(fall, 1.6) * 3.0;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uSeed; uniform vec3 uColor; uniform vec3 uLight;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float streaks = n(vec2(vUv.x*14.0 + uSeed*17.0, vUv.y*6.0 + uTime*(2.6 + uSeed))) * 0.6 + n(vec2(vUv.x*31.0 - uSeed*9.0, vUv.y*12.0 + uTime*4.0))*0.4;
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        float fade = smoothstep(0.0, 0.6, vUv.y) * (0.75 + 0.25 * n(vec2(vUv.x * 6.0, uTime * 0.5 + uSeed * 5.0)));
        // translucent sheet: mostly see-through with bright foamy streaks, a lip of white water at the top
        float lip = smoothstep(0.9, 1.0, vUv.y);
        float a = edge * fade * (0.24 + pow(streaks, 2.0) * 0.6 + lip * 0.4);
        vec3 c = uColor * uLight * (0.9 + streaks * 0.45 + lip * 0.3);
        gl_FragColor = vec4(c, a * 0.8);
        #include <fog_fragment>
      }`,
  }), [color])
  const inner = useMemo(() => { const m = mat.clone(); m.uniforms.uSeed.value = 0.63; return m }, [mat])
  useFrame((s) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime
    inner.uniforms.uTime.value = s.clock.elapsedTime
    ;(inner.uniforms.uLight.value as THREE.Color).copy(mat.uniforms.uLight.value as THREE.Color)
    const L = env.light
    ;(mat.uniforms.uLight.value as THREE.Color).copy(L.hemiSky).multiplyScalar(0.6 * L.hemiI).add(TMP.copy(L.sun).multiplyScalar(L.sunI * 0.25))
  })
  const mistMat = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64
    const g = cv.getContext('2d')!
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grd.addColorStop(0, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
    return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, opacity: 0.5, fog: true })
  }, [])
  const mist = useRef<THREE.Group>(null!)
  useFrame((s) => {
    mist.current.children.forEach((c, i) => {
      const k = (s.clock.elapsedTime * 0.2 + i / 9) % 1
      // billowing plume at the foot of the fall, drifting down and out
      c.position.set(Math.sin(i * 2.1) * width * 2.2 * (0.4 + k), -height * 1.0 - k * width * 1.5 + Math.sin(i) * width * 0.6, 3.5 + Math.cos(i * 1.3) * width * 1.4)
      const sc = width * (3.2 + k * 6)
      c.scale.set(sc, sc, 1)
      const sm = (c as THREE.Sprite).material as THREE.SpriteMaterial
      sm.opacity = 0.5 * Math.sin(k * Math.PI)
      sm.color.copy(mat.uniforms.uLight.value as THREE.Color).multiplyScalar(1.1)
    })
  })
  const mistMats = useMemo(() => Array.from({ length: 9 }, () => mistMat.clone()), [mistMat])
  return (
    <group position={[position[0], position[1], position[2]]} rotation-y={rotationY}>
      <mesh position={[0, -height / 2, -width * 0.9]} material={mat} renderOrder={2}>
        <cylinderGeometry args={[width * 0.9, width * 0.9, height, 10, 18, true, -0.75, 1.5]} />
      </mesh>
      <mesh position={[0, -height / 2, -width * 0.9]} material={inner} renderOrder={2} scale={[0.62, 1, 0.62]}>
        <cylinderGeometry args={[width * 0.9, width * 0.9, height, 8, 18, true, -0.75, 1.5]} />
      </mesh>
      <group ref={mist}>
        {mistMats.map((m, i) => <sprite key={i} material={m} renderOrder={3} />)}
      </group>
    </group>
  )
}
