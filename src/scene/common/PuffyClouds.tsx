import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useEnv } from './EnvContext'
import { useWorld } from '../../state/worldStore'
import { cloudSpecs } from '../../world/layout'
import { noise2, rng } from '../../lib/random'
import { afterglowRgb, cloudAfterglow } from '../../world/sunLook'

export interface PuffyOptions {
  detail: number
  flat: boolean
  /** number of steps in the light ramp (0 = smooth) */
  steps: number
  rim: number
  shadowTint: string
  lumps: number
}

/** Cumulus built from a cluster of spheres with a flattened base. */
export function buildPuffyCloud(seed: number, opts: PuffyOptions) {
  const r = rng(seed * 13 + 1)
  const parts: THREE.BufferGeometry[] = []
  const n = opts.lumps
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const x = (t - 0.5) * 2 * (1 + r() * 0.2)
    const big = Math.sin(t * Math.PI) // bigger in the middle
    const rad = 0.42 + big * 0.55 + r() * 0.18
    const g = new THREE.IcosahedronGeometry(rad, opts.detail)
    g.translate(x * 1.25, big * 0.35 + r() * 0.2, (r() - 0.5) * 0.6)
    parts.push(g)
  }
  // a few top puffs
  for (let i = 0; i < Math.max(1, Math.floor(n / 3)); i++) {
    const g = new THREE.IcosahedronGeometry(0.45 + r() * 0.3, opts.detail)
    g.translate((r() - 0.5) * 1.6, 0.75 + r() * 0.3, (r() - 0.5) * 0.4)
    parts.push(g)
  }
  let geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < 0) pos.setY(i, y * 0.22) // flat bottom
    if (!opts.flat) {
      // billowy, slightly irregular surface so silhouettes read as painted, not as spheres
      const x = pos.getX(i), z = pos.getZ(i), yy = pos.getY(i)
      const k = 1 + (noise2(x * 3.1 + seed, yy * 3.1 + z * 2.3) - 0.5) * 0.16
      pos.setXYZ(i, x * k, yy * (yy > 0 ? k : 1), z * k)
    }
  }
  if (opts.flat && geo.index) geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  if (!opts.flat) {
    // smooth normals across merged spheres: use direction from cloud centre blended with own normal
    const nor = geo.getAttribute('normal'), v = new THREE.Vector3(), nn = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).multiply(new THREE.Vector3(0.5, 1, 1)).normalize()
      nn.fromBufferAttribute(nor, i).lerp(v, 0.45).normalize()
      nor.setXYZ(i, nn.x, nn.y, nn.z)
    }
  }
  return geo
}

const TMP = new THREE.Color(), WHITE = new THREE.Color('#ffffff')
const MOON_UP = new THREE.Vector3(0.2, 1, 0.3).normalize()

export function PuffyClouds(opts: PuffyOptions & { scale?: number; opacity?: number }) {
  const env = useEnv()
  const day = useWorld((st) => st.day ?? 0)
  const specs = useMemo(() => cloudSpecs(day), [day])
  const group = useRef<THREE.Group>(null!)
  const { detail, flat, steps, rim, shadowTint, lumps } = opts
  const geos = useMemo(() => specs.map((sp) => buildPuffyCloud(sp.seed, { detail, flat, steps, rim, shadowTint, lumps })), [specs, detail, flat, steps, rim, shadowTint, lumps])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    fog: true,
    transparent: (opts.opacity ?? 1) < 1,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() },
      uRimCol: { value: new THREE.Color() }, uSteps: { value: steps }, uRim: { value: rim }, uOpacity: { value: opts.opacity ?? 1 },
      uGlow: { value: 0 }, uGlowCol: { value: new THREE.Color('#ffb15a') },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vN; varying vec3 vView; varying float vY; varying vec3 vWorld;
      void main(){
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vView = normalize(cameraPosition - wp.xyz);
        vY = position.y;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uSun, uLit, uShade, uRimCol, uGlowCol; uniform float uSteps, uRim, uOpacity, uGlow;
      varying vec3 vN; varying vec3 vView; varying float vY; varying vec3 vWorld;
      void main(){
        vec3 n = normalize(vN);
        vec3 sun = normalize(uSun);
        float l = dot(n, sun) * 0.5 + 0.5;
        l = mix(l, smoothstep(0.0, 1.0, l), 0.5);
        if (uSteps > 0.5) l = floor(l * uSteps + 0.5) / uSteps;
        float base = smoothstep(-0.25, 0.9, vY); // darker underside
        vec3 c = mix(uShade, uLit, clamp(l * (0.65 + base * 0.45), 0.0, 1.0));
        float fres = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.5);
        float back = max(dot(-normalize(vView), sun), 0.0);
        c += uRimCol * fres * uRim * (0.35 + back * 1.2);
        // Afterglow on undersides and the sun-facing side. Clouds toward the sun
        // azimuth take more of it; the opposite side stays near the base colour.
        vec3 sH = vec3(sun.x, 0.0, sun.z);
        float sHL = length(sH);
        float sunFace = sHL > 1e-4 ? smoothstep(-0.2, 0.8, dot(n, sH / sHL)) : 0.5;
        vec3 wH = vec3(vWorld.x, 0.0, vWorld.z);
        float place = sHL > 1e-4 ? smoothstep(-0.35, 0.55, dot(normalize(wH + vec3(1e-4)), sH / sHL)) : 0.5;
        float under = 1.0 - smoothstep(-0.05, 0.55, vY);
        float glowK = uGlow * (0.55 + 0.45 * place) * (0.18 + 0.82 * under) * (0.35 + 0.65 * sunFace);
        c = mix(c, uGlowCol, clamp(glowK, 0.0, 0.84));
        gl_FragColor = vec4(c, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  }), [steps, rim, opts.opacity])
  const shade = useMemo(() => new THREE.Color(shadowTint), [shadowTint])
  useFrame((_, dt) => {
    const u = mat.uniforms, L = env.light
    const glow = cloudAfterglow(env.sun.elevation, env.time)
    // Keep the low sun as the light until the afterglow has faded. Below that,
    // the scene moon takes over (same −3° switch as before, once glow is gone).
    u.uSun.value.copy(env.sun.elevation > -3 || glow > 0.02 ? env.sun.dir : MOON_UP)
    const [gr, gg, gb] = afterglowRgb(env.sun.elevation)
    u.uGlow.value = glow
    u.uGlowCol.value.setRGB(gr, gg, gb)
    // lit side: white warmed by the sun; shadow side: sky colour pushed towards the style's shadow tint
    u.uLit.value.copy(WHITE).lerp(L.sun, 0.25 + env.sun.golden * 0.45).multiplyScalar(0.25 + env.sun.day * 0.85)
    u.uShade.value.copy(L.hemiSky).lerp(shade, 0.45).lerp(L.fog, env.sun.golden * 0.35).multiplyScalar(0.3 + env.sun.day * 0.6)
    u.uRimCol.value.copy(TMP.copy(L.sun).lerp(WHITE, 0.4)).multiplyScalar(env.sun.day)
    // continuous drift (independent of time play/pause); wrap so the bank never empties
    group.current.children.forEach((c, i) => {
      c.position.x += dt * (0.55 + (i % 3) * 0.22)
      if (c.position.x > 280) c.position.x -= 560
    })
  })
  const sc = opts.scale ?? 1
  return (
    <group ref={group}>
      {specs.map((s, i) => (
        <mesh key={i} geometry={geos[i]} material={mat} position={s.pos} scale={[22 * s.scale * sc, 14 * s.scale * sc, 12 * s.scale * sc]} rotation-y={(i % 5) * 0.2 - 0.4} />
      ))}
    </group>
  )
}
