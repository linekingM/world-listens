import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useWorld } from '../../state/worldStore'
import { sharedEnv as env } from './sharedEnv'
import { fxUniforms } from './env'
import { roadX, terrainHeight } from '../../world/layout'

const N = 72
const DAY = new THREE.Color('#ffd76a'), NIGHT = new THREE.Color('#5ef3d2')

/**
 * The "wow" beat: dragging the sun stirs the world. A wind gust bends grass and trees, and a
 * stream of luminous petals swirls up the avenue toward the viewer (gold by day, cyan at night).
 */
export function WindGust() {
  const gust = useRef(0)
  const last = useRef(useWorld.getState().time)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(N), 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from({ length: N }, () => Math.random()), 1))
    return g
  }, [])
  const vel = useMemo(() => new Float32Array(N * 3), [])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: new THREE.Color() }, uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aLife; attribute float aSeed; varying float vA; varying float vRot; uniform float uTime; uniform float uPx;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = sin(clamp(aLife, 0.0, 1.0) * 3.14159);
        vRot = aSeed * 6.28 + uTime * (1.5 + aSeed * 2.0);
        gl_PointSize = clamp((0.6 + aSeed * 0.6) * uPx * 720.0 / -mv.z, 2.0, 48.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; varying float vA; varying float vRot;
      void main(){
        vec2 p = gl_PointCoord - 0.5;
        float c = cos(vRot), s = sin(vRot);
        p = mat2(c, -s, s, c) * p;
        p.x *= 2.1 + sin(vRot * 0.7) * 0.8; // tumbling petal: a flipping ellipse
        float d = length(p);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(uCol * (0.8 + 0.6 * smoothstep(0.25, 0.0, d)), a);
      }`,
  }), [])
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.25)
    const st = useWorld.getState()
    let dTime = Math.abs(st.time - last.current); if (dTime > 12) dTime = 24 - dTime
    last.current = st.time
    const rate = st.timeEase === 'drag' && dt > 0 ? dTime / dt : 0 // hours per second
    const target = Math.min(1, rate * 0.9)
    gust.current += (target - gust.current) * (1 - Math.exp(-dt * (target > gust.current ? 6 : 0.9)))
    const g = gust.current
    fxUniforms.uGust.value = g
    ;(window as unknown as { __gust: number }).__gust = g
    mat.uniforms.uTime.value = state.clock.elapsedTime
    mat.uniforms.uPx.value = state.gl.getPixelRatio() * state.size.height / 800
    ;(mat.uniforms.uCol.value as THREE.Color).copy(DAY).lerp(NIGHT, env.sun.night)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute, life = geo.getAttribute('aLife') as THREE.BufferAttribute
    const t = state.clock.elapsedTime
    let alive = 0
    for (let i = 0; i < N; i++) {
      let L = life.getX(i)
      if (L <= 0 || L >= 1) {
        // respawn only while the gust blows; spawn far up the avenue so petals travel toward the viewer
        if (g > 0.18 && Math.random() < g * dt * 3) {
          const z = -4 - Math.random() * 46
          const x = roadX(z) + (Math.random() - 0.5) * 26
          pos.setXYZ(i, x, terrainHeight(x, z) + 1 + Math.random() * 7, z)
          vel[i * 3] = (Math.random() - 0.5) * 2; vel[i * 3 + 1] = 0.5 + Math.random(); vel[i * 3 + 2] = 9 + Math.random() * 7
          L = 0.001
        } else { life.setX(i, 0); continue }
      }
      alive++
      const s = i * 1.37
      const x = pos.getX(i) + (vel[i * 3] + Math.sin(t * 2.2 + s) * 3.2) * dt
      const y = pos.getY(i) + (vel[i * 3 + 1] + Math.sin(t * 3.1 + s * 2) * 1.6) * dt
      const z = pos.getZ(i) + vel[i * 3 + 2] * (0.6 + g * 0.6) * dt
      pos.setXYZ(i, x, Math.max(y, terrainHeight(x, z) + 0.4), z)
      life.setX(i, L + dt / 4.5)
    }
    pos.needsUpdate = true; life.needsUpdate = true
    pts.current.visible = alive > 0
  })
  const pts = useRef<THREE.Points>(null!)
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} raycast={() => null} />
}
