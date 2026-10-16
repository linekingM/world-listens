import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { useEnv } from '../../common/EnvContext'
import { smoothstep } from '../../../lib/random'

const WHITE = new THREE.Color('#ffffff')

/**
 * Physically based (Preetham) sky with its built-in high cloud layer, extended with
 * a night gradient + procedural stars so evening → night is continuous.
 */
export function SkyA() {
  const env = useEnv()
  const sky = useMemo(() => {
    const s = new Sky()
    s.scale.setScalar(4500)
    const u = s.material.uniforms
    Object.assign(u, {
      uGain: { value: 0.55 },
      uNight: { value: 0 },
      uNightTop: { value: new THREE.Color('#050b22') },
      uNightHorizon: { value: new THREE.Color('#1a2850') },
      uT: { value: 0 },
      uGolden: { value: 0 },
      uSunTint: { value: new THREE.Color('#ffb070') },
    })
    u.turbidity.value = 3.2
    u.rayleigh.value = 2.1
    u.mieCoefficient.value = 0.0022
    u.mieDirectionalG.value = 0.72
    u.showSunDisc.value = 0
    u.cloudCoverage.value = 0.32
    u.cloudDensity.value = 0.35
    u.cloudScale.value = 0.00018
    u.cloudElevation.value = 0.65
    u.cloudSpeed.value = 0.00003
    const mat = s.material
    mat.fragmentShader = mat.fragmentShader
      .replace('uniform float time;', `uniform float time; uniform float uGain; uniform float uNight; uniform vec3 uNightTop; uniform vec3 uNightHorizon; uniform float uT; uniform float uGolden; uniform vec3 uSunTint;
        float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }`)
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `
        texColor *= uGain;
        // art-directed golden hour: warm the lower sky, strongest towards the sun
        float hz = exp(-max(direction.y, 0.0) * 6.0);
        float toSun = pow(max(cosTheta, 0.0), 3.0);
        texColor *= mix(vec3(1.0), vec3(1.4, 0.82, 0.52), uGolden * hz * (0.45 + 0.55 * toSun));
        texColor = texColor / (1.0 + max(max(texColor.r, texColor.g), texColor.b) * 0.35);
        // larger, softer cinematic sun disc + halo (the physical one is only ~0.5°)
        float disc2 = smoothstep(0.99955, 0.99975, cosTheta);
        float halo = pow(max(cosTheta, 0.0), 180.0) * 0.6 + pow(max(cosTheta, 0.0), 1400.0) * 1.5;
        float vis = smoothstep(-0.02, 0.01, vSunDirection.y);
        texColor += uSunTint * (disc2 * 8.0 + halo * (0.35 + uGolden * 0.6)) * vis;
        vec3 nightCol = mix(uNightHorizon, uNightTop, pow(clamp(direction.y, 0.0, 1.0), 0.6));
        vec3 sp = direction * 260.0; vec3 cell = floor(sp);
        float h = hash13(cell);
        float star = step(0.9965, h) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4*sin(uT*2.0 + h*80.0));
        nightCol += vec3(0.9, 0.95, 1.0) * star * 2.5 * smoothstep(0.02, 0.25, direction.y);
        texColor = mix(texColor, nightCol, uNight);
        gl_FragColor = vec4( texColor, 1.0 );`)
    mat.depthWrite = false
    return s
  }, [])
  useFrame((st) => {
    const u = sky.material.uniforms
    u.sunPosition.value.copy(env.sun.dir)
    u.time.value = st.clock.elapsedTime
    u.uT.value = st.clock.elapsedTime
    u.uNight.value = smoothstep(-1.5, -10, env.sun.elevation)
    // golden hours get a slightly hazier, warmer sky
    u.turbidity.value = 3.0 + env.sun.golden * 2.5
    u.uGolden.value = env.sun.golden
    u.uSunTint.value.copy(env.light.sun).lerp(WHITE, 0.3)
    u.uGain.value = 0.5 + env.sun.golden * 0.15
  })
  return <primitive object={sky} />
}
