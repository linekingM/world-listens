import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEnv } from './EnvContext'
import { terrainHeight } from '../../world/layout'

const TMP = new THREE.Color()
const V = new THREE.Vector3(), O = new THREE.Vector3(), S = new THREE.Vector3(), N = new THREE.Vector3()
const Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0)
/** longest fall we draw to the ground; higher islands let the water dissolve into spray in mid-air */
const MAX_FALL = 70

function softDisc(stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const g = cv.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  for (const [k, c] of stops) grd.addColorStop(k, c)
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(cv)
}

/**
 * A thin animated ribbon of water spilling off a floating island. It is lit by the scene (sky + sun/moon, dim at
 * night, never self-lit) and reaches the terrain below, where it lands in a small pool with a foam ring and a few
 * small, soft spray puffs. The fall length follows the island (drag/scale) every frame.
 */
export function Waterfall({ position, height = 26, width = 1.8, color = '#dff3ff', rotationY = 0 }: {
  position: [number, number, number]; height?: number; width?: number; color?: string; rotationY?: number
}) {
  const env = useEnv()
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSeed: { value: 0 }, uLen: { value: height }, uLand: { value: 1 }, uColor: { value: new THREE.Color(color) }, uLight: { value: new THREE.Color(1, 1, 1) } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      uniform float uLen;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        // unit-height open arc, top at 0: stretch to the fall length, belly outward, spread a little as it falls
        vec3 p = position;
        float fall = 1.0 - uv.y;
        p.y = -fall * uLen;
        p.xz *= 1.0 + fall * 0.5;
        p.z += pow(fall, 1.6) * 3.0;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uSeed; uniform float uLen; uniform float uLand; uniform vec3 uColor; uniform vec3 uLight;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float ys = uLen / 26.0;
        float streaks = n(vec2(vUv.x*14.0 + uSeed*17.0, vUv.y*6.0*ys + uTime*(2.6 + uSeed))) * 0.6 + n(vec2(vUv.x*31.0 - uSeed*9.0, vUv.y*12.0*ys + uTime*4.0))*0.4;
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        // landing: water stays visible to the pool; too high: it thins out into spray halfway down
        float fade = mix(smoothstep(0.0, 0.6, vUv.y), smoothstep(0.0, 0.04, vUv.y), uLand) * (0.75 + 0.25 * n(vec2(vUv.x * 6.0, uTime * 0.5 + uSeed * 5.0)));
        float lip = smoothstep(0.9, 1.0, vUv.y);
        float a = edge * fade * (0.2 + pow(streaks, 2.0) * 0.5 + lip * 0.35);
        // lit, not glowing: albedo x incoming light, streaks only modulate it slightly
        vec3 c = uColor * uLight * (0.75 + streaks * 0.3 + lip * 0.2);
        gl_FragColor = vec4(c, a * 0.75);
        #include <fog_fragment>
      }`,
  }), [color, height])
  const inner = useMemo(() => { const m = mat.clone(); m.uniforms.uSeed.value = 0.63; return m }, [mat])
  const tex = useMemo(() => ({
    puff: softDisc([[0, 'rgba(255,255,255,0.7)'], [0.5, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]),
    pool: softDisc([[0, 'rgba(255,255,255,1)'], [0.72, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]),
    ring: softDisc([[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0)'], [0.78, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]),
  }), [])
  // pool + foam use real (lit) materials so they sit in the scene's light like the meadow around them
  const poolMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#40606c', roughness: 0.12, metalness: 0.1, alphaMap: tex.pool, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), [tex])
  const foamMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2f6f6', roughness: 0.8, alphaMap: tex.ring, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), [tex])
  const puffMats = useMemo(() => Array.from({ length: 5 }, () => new THREE.SpriteMaterial({ map: tex.puff, transparent: true, depthWrite: false, opacity: 0, fog: true })), [tex])

  const root = useRef<THREE.Group>(null!)
  const splash = useRef<THREE.Group>(null!)
  const foam = useRef<THREE.Mesh>(null!)
  const st = useRef({ len: height })
  useFrame((s) => {
    const t = s.clock.elapsedTime
    mat.uniforms.uTime.value = inner.uniforms.uTime.value = t
    const L = env.light
    const light = mat.uniforms.uLight.value as THREE.Color
    light.copy(L.hemiSky).multiplyScalar(0.42 * L.hemiI).add(TMP.copy(L.sun).multiplyScalar(L.sunI * 0.2)).multiplyScalar(1 - env.sun.night * 0.55)
    ;(inner.uniforms.uLight.value as THREE.Color).copy(light)

    // fall length: from the lip down to the terrain under the foot (two passes: the foot drifts out as the fall grows)
    const g = root.current
    g.updateWorldMatrix(true, false)
    g.getWorldPosition(O); g.getWorldScale(S)
    const sc = S.y || 1
    let len = st.current.len, ground = 0
    for (let k = 0; k < 2; k++) {
      V.set(0, -len, width * 0.45 + 3.0); g.localToWorld(V)
      ground = terrainHeight(V.x, V.z)
      len = (O.y - ground) / sc
    }
    const land = len > 2 && len < MAX_FALL
    len = THREE.MathUtils.clamp(len, 2, MAX_FALL * 0.6)
    st.current.len = land ? len : MAX_FALL * 0.6
    mat.uniforms.uLen.value = inner.uniforms.uLen.value = st.current.len
    mat.uniforms.uLand.value = inner.uniforms.uLand.value = land ? 1 : 0

    // pool group: world space, laid on the terrain normal at the landing point
    const sp = splash.current
    sp.visible = land
    if (!land) return
    V.set(0, -len, width * 0.45 + 3.0); g.localToWorld(V)
    const e = 0.6
    N.set(terrainHeight(V.x - e, V.z) - terrainHeight(V.x + e, V.z), 2 * e, terrainHeight(V.x, V.z - e) - terrainHeight(V.x, V.z + e)).normalize()
    Q.setFromUnitVectors(UP, N)
    V.y = terrainHeight(V.x, V.z) + 0.06
    ;(window as unknown as { __fallFoot: number[] }).__fallFoot = [V.x, V.y, V.z]
    const r = width * sc
    sp.matrixWorld.compose(V, Q, S.set(r, r, r))
    const pulse = (t * 0.6) % 1
    foam.current.scale.setScalar(0.85 + pulse * 0.35)
    foamMat.opacity = 0.5 * (1 - pulse * 0.6)
    foamMat.color.copy(light).multiplyScalar(0.5).addScalar(0.15)
    // spray: a few small puffs right at the impact point, rising a little and fading (lit like the water)
    sp.children.forEach((c) => {
      const i = c.userData.puff
      if (i === undefined) return
      const k = (t * 0.35 + i / puffMats.length) % 1
      c.position.set(Math.sin(i * 2.4) * 0.35 * (0.5 + k), 0.25 + k * 0.7, Math.cos(i * 1.7) * 0.3 * (0.5 + k))
      const z = 0.45 + k * 0.55
      c.scale.set(z, z, 1)
      const m = puffMats[i]
      m.opacity = 0.32 * Math.sin(k * Math.PI)
      m.color.copy(light).multiplyScalar(0.95)
    })
  })
  return (
    <group ref={root} position={[position[0], position[1], position[2]]} rotation-y={rotationY}>
      <mesh position={[0, 0, -width * 0.9]} material={mat} renderOrder={2} frustumCulled={false}>
        <cylinderGeometry args={[width * 0.9, width * 0.9, 1, 10, 24, true, -0.75, 1.5]} />
      </mesh>
      <mesh position={[0, 0, -width * 0.9]} material={inner} renderOrder={2} scale={[0.62, 1, 0.62]} frustumCulled={false}>
        <cylinderGeometry args={[width * 0.9, width * 0.9, 1, 8, 24, true, -0.75, 1.5]} />
      </mesh>
      {/* world-space landing pool (matrixWorld is set by hand each frame) */}
      <group ref={splash} matrixAutoUpdate={false} matrixWorldAutoUpdate={false}>
        <mesh rotation-x={-Math.PI / 2} material={poolMat} renderOrder={1} receiveShadow>
          <circleGeometry args={[1.25, 32]} />
        </mesh>
        <mesh ref={foam} rotation-x={-Math.PI / 2} position-y={0.02} material={foamMat} renderOrder={1}>
          <circleGeometry args={[1, 32]} />
        </mesh>
        {puffMats.map((m, i) => <sprite key={i} material={m} renderOrder={3} userData={{ puff: i }} />)}
      </group>
    </group>
  )
}
