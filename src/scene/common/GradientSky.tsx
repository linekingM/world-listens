import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEnv } from './EnvContext'
import { smoothstep } from '../../lib/random'

const WHITE = new THREE.Color(1, 1, 1)
const AMBER = new THREE.Color("#ff6a28")

export interface GradientSkyOptions {
  /** angular radius of the sun disc in degrees */
  sunSize?: number
  /** 0 = crisp disc, 1 = very soft */
  sunSoftness?: number
  /** brightness of the disc (HDR, >1 blooms) */
  sunPower?: number
  /** amount of painterly low-frequency colour variation */
  paint?: number
  /** number of flat colour bands (0 = smooth) for a stylised gradient */
  bands?: number
  /** colour of the warm horizon glow band at golden hour */
  glow?: string
  starDensity?: number
  /** exponent of the horizon→zenith blend; lower keeps the warm horizon colour tight to the horizon */
  gradientPower?: number
}

/** Stylised sky dome: palette-driven gradient + sun disc/halo + golden glow + stars. */
export function GradientSky({ sunSize = 2.2, sunSoftness = 0.35, sunPower = 2.2, paint = 0.05, bands = 0, glow = '#ff9a6a', starDensity = 0.996, gradientPower = 0.48 }: GradientSkyOptions) {
  const env = useEnv()
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color(glow) }, uSun: { value: new THREE.Vector3() }, uGolden: { value: 0 }, uNight: { value: 0 },
      uDay: { value: 1 }, uT: { value: 0 }, uSunCos: { value: Math.cos(THREE.MathUtils.degToRad(sunSize)) },
      uSoft: { value: sunSoftness }, uPower: { value: sunPower }, uPaint: { value: paint }, uBands: { value: bands }, uStar: { value: starDensity }, uGP: { value: gradientPower },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uSunCol, uGlow, uSun; uniform float uGolden, uNight, uDay, uT, uSunCos, uSoft, uPower, uPaint, uBands, uStar, uGP;
      varying vec3 vDir;
      float h3(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z); }
      void main(){
        vec3 d = normalize(vDir);
        float y = clamp(d.y, -0.2, 1.0);
        float g = pow(clamp(y, 0.0, 1.0), uGP);
        if (uBands > 0.5) g = floor(g * uBands + 0.5) / uBands * 0.6 + g * 0.4;
        vec3 col = mix(uHorizon, uTop, g);
        float cosA = dot(d, normalize(uSun));
        // golden band hugging the horizon, strongest towards the sun
        float side = pow(max(cosA * 0.5 + 0.5, 0.0), 3.0);
        float band = exp(-max(y, 0.0) * 14.0) * uGolden * (0.25 + side * 0.9);
        col = mix(col, uGlow, clamp(band, 0.0, 1.0));
        // soft halo around the sun
        col += uSunCol * pow(max(cosA, 0.0), 24.0) * (0.35 + uGolden * 0.4) * uDay;
        col += uSunCol * pow(max(cosA, 0.0), 4.0) * 0.12 * uDay;
        // painterly low-frequency variation
        float p = n3(d * 4.0 + vec3(0.0, uT * 0.01, 0.0)) * 0.6 + n3(d * 11.0) * 0.4;
        col *= 1.0 + (p - 0.5) * uPaint * 2.0;
        // sun disc
        float edge = (1.0 - uSunCos) * (0.15 + uSoft);
        float disc = smoothstep(uSunCos - edge, uSunCos + edge * 0.2, cosA);
        col = mix(col, uSunCol * uPower, disc * uDay * smoothstep(-0.03, 0.02, uSun.y));
        // below horizon fade to horizon colour (hidden by terrain mostly)
        col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.15, d.y));
        // stars
        vec3 sp = d * 220.0; vec3 c = floor(sp); float hs = h3(c);
        float star = step(uStar, hs) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(uT * 1.7 + hs * 90.0));
        col += vec3(1.0, 0.97, 0.9) * star * 2.2 * uNight * smoothstep(0.05, 0.3, d.y);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), [glow, sunSize, sunSoftness, sunPower, paint, bands, starDensity, gradientPower])

  useFrame((s) => {
    const u = mat.uniforms, L = env.light
    u.uTop.value.copy(L.skyTop)
    u.uHorizon.value.copy(L.skyHorizon)
    const gld = env.sun.golden
    u.uSunCol.value.copy(L.sun).lerp(WHITE, 0.06 + (1 - gld) * 0.22)
    if (gld > 0.02) u.uSunCol.value.lerp(AMBER, gld * 0.4)
    u.uPower.value = sunPower * (0.55 + 0.45 * smoothstep(-2, 16, env.sun.elevation))
    u.uSun.value.copy(env.sun.dir)
    u.uGolden.value = env.sun.golden
    u.uNight.value = env.sun.night
    u.uDay.value = smoothstep(-4, 1, env.sun.elevation)
    u.uT.value = s.clock.elapsedTime
  })
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[4000, 48, 24]} />
    </mesh>
  )
}
