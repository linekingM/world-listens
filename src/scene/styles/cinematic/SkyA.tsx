import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { useEnv } from '../../common/EnvContext'
import { smoothstep } from '../../../lib/random'

const WHITE = new THREE.Color('#ffffff')
const AMBER = new THREE.Color('#ff6a28')

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
      uCover: { value: 0 },
      uSat: { value: 1 },
      uMist: { value: 0 },
      uFogCol: { value: new THREE.Color('#dde6ee') },
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
      .replace('uniform float time;', `uniform float time; uniform float uGain; uniform float uNight; uniform vec3 uNightTop; uniform vec3 uNightHorizon; uniform float uT; uniform float uGolden; uniform vec3 uSunTint; uniform float uCover; uniform float uMist; uniform float uSat; uniform vec3 uFogCol;
        float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }`)
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `
        texColor *= uGain;
        // art-directed golden hour: warm the lower sky, strongest towards the sun
        float hz = exp(-max(direction.y, 0.0) * 6.0);
        float toSun = pow(max(cosTheta, 0.0), 3.0);
        texColor *= mix(vec3(1.0), vec3(1.4, 0.82, 0.52), uGolden * hz * (0.45 + 0.55 * toSun));
        texColor = texColor / (1.0 + max(max(texColor.r, texColor.g), texColor.b) * 0.35);
        // sunset band: a thin coral stripe hugging the horizon, deepest toward the sun, fading to violet away from it
        float hy = max(direction.y, -0.02) / 0.055; // squared by hand: pow() of a negative base is NaN on real GPUs
        float band = exp(-hy * hy) * uGolden * (1.0 - uCover * 0.8);
        vec3 bandCol = mix(vec3(0.62, 0.42, 0.72), vec3(1.0, 0.45, 0.32), 0.35 + 0.65 * pow(max(cosTheta, 0.0), 2.0));
        texColor = mix(texColor, texColor * 0.6 + bandCol * 0.5, band * 0.55);
        // larger, softer cinematic sun disc + halo; dims and warms near the horizon (night sky stays cool)
        float disc2 = smoothstep(0.9993, 0.99978, cosTheta);
        float halo = pow(max(cosTheta, 0.0), 180.0) * 0.6 + pow(max(cosTheta, 0.0), 1400.0) * 1.5;
        float vis = smoothstep(-0.02, 0.01, vSunDirection.y);
        float elevF = smoothstep(-0.02, 0.28, vSunDirection.y); // 0 at horizon → 1 ~high
        // soft gold → amber → orange-red toward dusk
        vec3 warm = mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.28, 0.06), clamp(1.0 - elevF * 0.85, 0.0, 1.0));
        vec3 discCol = mix(uSunTint, warm, clamp(uGolden * (0.65 + (1.0 - elevF) * 0.4), 0.0, 0.95));
        float coverK = 1.0 - smoothstep(0.25, 0.7, uCover);
        // REPLACE the core (don't HDR-add) so bloom keeps the hue; soft halo still adds
        float core = disc2 * vis * coverK;
        texColor = mix(texColor, discCol * mix(1.05, 1.55, elevF), core);
        texColor += discCol * halo * (0.22 + uGolden * 0.85) * (1.0 - uCover * 0.5) * mix(0.55, 1.0, elevF) * vis;
        // warm the Preetham aureole so golden-hour sun doesn't read as cool white
        float aure = pow(max(cosTheta, 0.0), 12.0) * uGolden * vis;
        texColor.rgb = mix(texColor.rgb, texColor.rgb * mix(vec3(1.15, 0.78, 0.42), vec3(1.2, 0.45, 0.18), 1.0 - elevF), clamp(aure * 1.4, 0.0, 0.85));
        // midday: richer blue overhead (the physical model reads pale after tone mapping)
        float lum0 = dot(texColor, vec3(0.299, 0.587, 0.114));
        texColor = max(mix(vec3(lum0), texColor, mix(1.0, uSat, smoothstep(0.0, 0.35, direction.y))), 0.0);
        // overcast: flatten towards a soft luminous grey; mist: fade the lower sky into the fog colour
        float lum = dot(texColor, vec3(0.299, 0.587, 0.114));
        vec3 overcast = vec3(lum) * vec3(0.96, 0.99, 1.04) * (0.85 + 0.25 * smoothstep(-0.1, 0.6, direction.y));
        texColor = mix(texColor, overcast, smoothstep(0.1, 0.85, uCover) * 0.92);
        texColor = mix(texColor, uFogCol, uMist * exp(-max(direction.y, 0.0) * 3.5) * 0.9);
        vec3 nightCol = mix(uNightHorizon, uNightTop, pow(clamp(direction.y, 0.0, 1.0), 0.6));
        vec3 sp = direction * 260.0; vec3 cell = floor(sp);
        float h = hash13(cell);
        float star = step(0.9965, h) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4*sin(uT*2.0 + h*80.0));
        nightCol += vec3(0.9, 0.95, 1.0) * star * 2.5 * smoothstep(0.02, 0.25, direction.y) * (1.0 - uCover);
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
    u.turbidity.value = 2.5 + env.sun.golden * 3.0
    u.uSat.value = 1 + env.sun.day * (1 - env.sun.golden) * 0.35
    u.uGolden.value = env.sun.golden
    // soft gold → amber → orange-red as golden rises; cool only at high noon
    const g = env.sun.golden
    const elev = env.sun.elevation
    u.uSunTint.value.copy(env.light.sun).lerp(WHITE, Math.max(0, 0.04 + (1 - g) * 0.2 - Math.max(0, (8 - elev) * 0.015)))
    if (g > 0.02) u.uSunTint.value.lerp(AMBER, g * (0.35 + Math.max(0, (12 - elev) / 20)))
    u.uGain.value = (0.5 + env.sun.golden * 0.15) * (1 - env.weather.cover * 0.12)
    u.uCover.value = Math.max(0, env.weather.cover - 0.25) / 0.75
    u.uMist.value = env.weather.mist
    u.uFogCol.value.copy((st.scene.fog as THREE.FogExp2 | null)?.color ?? WHITE)
    u.cloudCoverage.value = env.weather.cover > 0.45 ? 0.1 : 0.25 + env.weather.cover * 0.3
    u.cloudDensity.value = 0.3 + env.weather.cover * 0.5
  })
  return <primitive object={sky} />
}
