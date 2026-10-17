import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { useEnv } from '../../common/EnvContext'
import { smoothstep } from '../../../lib/random'

const WHITE = new THREE.Color('#ffffff')
const AMBER = new THREE.Color('#ff3a0a')

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
    u.turbidity.value = 1.8
    u.rayleigh.value = 3.0
    u.mieCoefficient.value = 0.0014
    u.mieDirectionalG.value = 0.78
    u.showSunDisc.value = 0
    u.cloudCoverage.value = 0.18
    u.cloudDensity.value = 0.28
    u.cloudScale.value = 0.00018
    u.cloudElevation.value = 0.65
    u.cloudSpeed.value = 0.00003
    const mat = s.material
    mat.fragmentShader = mat.fragmentShader
      .replace('uniform float time;', `uniform float time; uniform float uGain; uniform float uNight; uniform vec3 uNightTop; uniform vec3 uNightHorizon; uniform float uT; uniform float uGolden; uniform vec3 uSunTint; uniform float uCover; uniform float uMist; uniform float uSat; uniform vec3 uFogCol;
        float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }`)
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `
        texColor *= uGain;
        // clear-day: replace Preetham milky whiteout with a natural gradient (zenith soft blue, horizon pale blue — not white paint)
        float elevSky = max(direction.y, 0.0);
        float dayClear = (1.0 - uGolden) * (1.0 - uCover) * (1.0 - uNight);
        // horizon stays slightly desaturated pale blue (never chalk white)
        vec3 clearHorizon = vec3(0.48, 0.68, 0.88); // pale blue, not white
        vec3 clearZenith = vec3(0.12, 0.36, 0.76);
        vec3 clearBlue = mix(clearHorizon, clearZenith, pow(elevSky, 0.42));
        float skyHaze = exp(-elevSky * 2.8);
        float lumSky = max(max(texColor.r, texColor.g), texColor.b);
        float whiteClamp = smoothstep(0.7, 1.15, lumSky) * dayClear;
        texColor = mix(texColor, clearBlue, dayClear * (skyHaze * 1.0 + (1.0 - skyHaze) * 0.55));
        texColor = mix(texColor, clearBlue, min(1.0, whiteClamp * (0.75 + skyHaze * 0.35)));
        // art-directed golden hour: warm the lower sky, strongest towards the sun
        float hz = exp(-max(direction.y, 0.0) * 6.0);
        float toSun = pow(max(cosTheta, 0.0), 3.0);
        texColor *= mix(vec3(1.0), vec3(1.22, 0.7, 0.42), uGolden * hz * (0.35 + 0.4 * toSun) * (1.0 - pow(max(cosTheta, 0.0), 40.0) * 0.7));
        texColor = texColor / (1.0 + max(max(texColor.r, texColor.g), texColor.b) * 0.42);
        // sunset band: a thin coral stripe hugging the horizon, deepest toward the sun, fading to violet away from it
        float hy = max(direction.y, -0.02) / 0.055; // squared by hand: pow() of a negative base is NaN on real GPUs
        float band = exp(-hy * hy) * uGolden * (1.0 - uCover * 0.8);
        vec3 bandCol = mix(vec3(0.55, 0.38, 0.68), vec3(1.0, 0.42, 0.28), 0.35 + 0.65 * pow(max(cosTheta, 0.0), 2.0));
        texColor = mix(texColor, texColor * 0.55 + bandCol * 0.55, band * 0.62);
        // CLEAR orange-red disc: large enough to read, REPLACE core, kill Mie aureole
        float discInner = smoothstep(0.9992, 0.99965, cosTheta);
        float discRim = max(0.0, smoothstep(0.9985, 0.9992, cosTheta) - discInner);
        float vis = smoothstep(-0.03, 0.008, vSunDirection.y);
        // elevF reaches ~1 only when sun is high (~25°+); at 17:53 (~9°) elevF~0.35 → already red-orange
        float elevF = smoothstep(-0.02, 0.42, vSunDirection.y);
        float loK = clamp(1.0 - elevF, 0.0, 1.0);
        // force redder whenever golden hour is on
        float redK = clamp(max(loK * 1.15, uGolden * 1.05), 0.0, 1.0);
        vec3 warmHi = vec3(1.0, 0.55, 0.16);   // already orange by late afternoon
        vec3 warmMid = vec3(1.0, 0.24, 0.04);  // orange-red
        vec3 warmLo = vec3(0.88, 0.06, 0.02);  // deep red near horizon
        vec3 warm = mix(warmHi, warmMid, smoothstep(0.0, 0.45, redK));
        warm = mix(warm, warmLo, smoothstep(0.4, 1.0, redK));
        // almost fully art-directed colour at golden/dusk (ignore pale light-key tint)
        vec3 discCol = mix(uSunTint, warm, clamp(0.85 + redK * 0.15, 0.0, 1.0));
        float coverK = 1.0 - smoothstep(0.3, 0.75, uCover);
        float core = discInner * vis * coverK;
        texColor = mix(texColor, discCol, core); // full replace — readable circle
        texColor = mix(texColor, discCol * 0.7, discRim * vis * coverK);
        // suppress Preetham Mie glow that turns the disc into a white blob
        float aureKill = pow(max(cosTheta, 0.0), 18.0) * vis * coverK;
        texColor = mix(texColor, mix(texColor * vec3(1.0, 0.55, 0.25), discCol * 0.5, 0.4), aureKill * (0.7 + uGolden * 0.3));
        float halo = pow(max(cosTheta, 0.0), 1200.0) * 0.05 * (1.0 - core);
        texColor += discCol * halo * vis * (1.0 - uCover * 0.5);
        // midday: richer blue overhead (the physical model reads pale after tone mapping)
        float lum0 = dot(texColor, vec3(0.299, 0.587, 0.114));
        float satK = mix(1.0, uSat, smoothstep(0.0, 0.45, direction.y));
        satK = mix(satK, max(satK, 1.35), dayClear * smoothstep(0.05, 0.55, direction.y));
        texColor = max(mix(vec3(lum0), texColor, satK), 0.0);
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
    // clear day: low turbidity / high rayleigh → deeper blue; golden hour hazes gently
    u.turbidity.value = 0.95 + env.sun.golden * 2.8 + env.weather.cover * 2.2
    u.rayleigh.value = 3.6 - env.sun.golden * 0.75 - env.weather.cover * 0.75
    u.uSat.value = 1 + env.sun.day * (1 - env.sun.golden) * 0.55
    u.uGolden.value = env.sun.golden
    // sun tint follows light key; barely bleach toward white, push amber hard near horizon
    const g = env.sun.golden
    const elev = env.sun.elevation
    u.uSunTint.value.copy(env.light.sun).lerp(WHITE, Math.max(0, 0.02 + (1 - g) * 0.08 - Math.max(0, (10 - elev) * 0.02)))
    if (g > 0.01 || elev < 18) u.uSunTint.value.lerp(AMBER, Math.min(1.0, g * 0.85 + Math.max(0, (18 - elev) / 14) * 0.9))
    u.uGain.value = (0.30 + env.sun.golden * 0.16) * (1 - env.weather.cover * 0.12)
    u.uCover.value = Math.max(0, env.weather.cover - 0.25) / 0.75
    u.uMist.value = env.weather.mist
    u.uFogCol.value.copy((st.scene.fog as THREE.FogExp2 | null)?.color ?? WHITE)
    // thinner built-in sky clouds on clear days (they read as white haze near the horizon)
    u.cloudCoverage.value = env.weather.cover > 0.45 ? 0.08 : 0.02 + env.weather.cover * 0.12
    u.cloudDensity.value = 0.22 + env.weather.cover * 0.45
  })
  return <primitive object={sky} />
}
