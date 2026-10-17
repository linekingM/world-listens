import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { useEnv } from '../../common/EnvContext'
import { smoothstep } from '../../../lib/random'
import { useWorld } from '../../../state/worldStore'
import { effectiveWarmth, warmthToRgb, physicalSunWarmth, sunDiscExtinction } from '../../../world/sunLook'

const WHITE = new THREE.Color('#ffffff')

/**
 * Physically based (Preetham) sky + night stars.
 * Sun disc: pale white above ~20° elevation; warm on the same curve at dawn and dusk.
 * The disc dims toward the horizon. Its angular size does not change.
 * Optional manual warmth/hue from store (sunLook).
 */
export function SkyA() {
  const env = useEnv()
  const sky = useMemo(() => {
    const s = new Sky()
    s.scale.setScalar(4500)
    const u = s.material.uniforms
    Object.assign(u, {
      uGain: { value: 0.5 },
      uNight: { value: 0 },
      uNightTop: { value: new THREE.Color('#050b22') },
      uNightHorizon: { value: new THREE.Color('#1a2850') },
      uT: { value: 0 },
      uGolden: { value: 0 },
      uSunTint: { value: new THREE.Color('#fff6e8') },
      uWarmth: { value: 0 },
      uCover: { value: 0 },
      uSat: { value: 1 },
      uMist: { value: 0 },
      uFogCol: { value: new THREE.Color('#dde6ee') },
    })
    u.turbidity.value = 2.4
    u.rayleigh.value = 2.4
    u.mieCoefficient.value = 0.002
    u.mieDirectionalG.value = 0.76
    u.showSunDisc.value = 0
    u.cloudCoverage.value = 0.22
    u.cloudDensity.value = 0.32
    u.cloudScale.value = 0.00018
    u.cloudElevation.value = 0.65
    u.cloudSpeed.value = 0.00003
    const mat = s.material
    mat.fragmentShader = mat.fragmentShader
      .replace('uniform float time;', `uniform float time; uniform float uGain; uniform float uNight; uniform vec3 uNightTop; uniform vec3 uNightHorizon; uniform float uT; uniform float uGolden; uniform vec3 uSunTint; uniform float uWarmth; uniform float uCover; uniform float uMist; uniform float uSat; uniform vec3 uFogCol;
        float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }`)
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `
        texColor *= uGain;
        // gentle clear-day blue (do not erase all haze — keep soft horizon)
        float elevSky = max(direction.y, 0.0);
        float dayClear = (1.0 - uGolden) * (1.0 - uCover) * (1.0 - uNight);
        vec3 clearHorizon = vec3(0.62, 0.76, 0.90);
        vec3 clearZenith = vec3(0.22, 0.45, 0.82);
        vec3 clearBlue = mix(clearHorizon, clearZenith, pow(elevSky, 0.5));
        float skyHaze = exp(-elevSky * 4.0);
        float lumSky = max(max(texColor.r, texColor.g), texColor.b);
        // only tame chalk-white blowouts, leave soft haze
        float whiteClamp = smoothstep(1.05, 1.55, lumSky) * dayClear * skyHaze;
        texColor = mix(texColor, clearBlue, dayClear * skyHaze * 0.35);
        texColor = mix(texColor, clearBlue * 0.98, whiteClamp * 0.55);
        // golden hour sky warmth only when sun is low (uGolden already elevation-shaped)
        float hz = exp(-max(direction.y, 0.0) * 6.0);
        float toSun = pow(max(cosTheta, 0.0), 4.0);
        // no nearDisc hole-punch (that made a contrasting ring around the disc)
        texColor *= mix(vec3(1.0), vec3(1.15, 0.82, 0.55), uGolden * hz * (0.25 + 0.35 * toSun) * (1.0 - pow(max(cosTheta, 0.0), 200.0) * 0.5));
        texColor = texColor / (1.0 + max(max(texColor.r, texColor.g), texColor.b) * 0.38);
        // sunset horizon band — only with real golden
        float hy = max(direction.y, -0.02) / 0.055;
        float band = exp(-hy * hy) * uGolden * (1.0 - uCover * 0.8);
        vec3 bandCol = mix(vec3(0.55, 0.38, 0.68), vec3(1.0, 0.45, 0.3), 0.35 + 0.65 * pow(max(cosTheta, 0.0), 2.0));
        texColor = mix(texColor, texColor * 0.6 + bandCol * 0.45, band * 0.5);
        // SUN DISC — single soft circle, NO outer ring. Colour from uSunTint (driven by warmth).
        float disc = smoothstep(0.99925, 0.99978, cosTheta);
        float vis = smoothstep(-0.03, 0.01, vSunDirection.y);
        float coverK = 1.0 - smoothstep(0.3, 0.75, uCover);
        float core = disc * vis * coverK;
        // pale white core by day; warmer only when uWarmth rises — never a dark rim
        vec3 discCol = uSunTint;
        texColor = mix(texColor, discCol, core);
        // soft falloff only (same hue — not a contrasting ring). Tighter and dimmer
        // as warmth rises so the dusk aureole does not wash over the disc. Midday
        // (uWarmth = 0) stays at exponent 900 and gain 0.04. Disc radius is unchanged.
        float softPow = mix(900.0, 1900.0, clamp(uWarmth, 0.0, 1.0));
        float soft = pow(max(cosTheta, 0.0), softPow) * (1.0 - disc) * vis * coverK;
        texColor += discCol * soft * mix(0.04, 0.026, clamp(uWarmth, 0.0, 1.0));
        // midday saturation
        float lum0 = dot(texColor, vec3(0.299, 0.587, 0.114));
        float satK = mix(1.0, uSat, smoothstep(0.0, 0.4, direction.y));
        texColor = max(mix(vec3(lum0), texColor, satK), 0.0);
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
    const stw = useWorld.getState()
    const look = stw.sunLook
    const elev = env.sun.elevation
    const hour = stw.time
    const phys = physicalSunWarmth(elev, hour)
    const warmth = effectiveWarmth(look, elev, hour)
    const [wr, wg, wb] = warmthToRgb(warmth, look.hue)
    const ext = sunDiscExtinction(elev)
    const dr = wr * ext, dg = wg * ext, db = wb * ext
    // golden for sky band: only when physically warm (not the broad elev golden)
    u.uGolden.value = Math.max(env.sun.golden * 0.35, phys)
    u.uWarmth.value = warmth
    u.uSunTint.value.setRGB(dr, dg, db)
    // mild turbidity; don't bleach midday
    u.turbidity.value = 2.0 + phys * 2.2 + env.weather.cover * 1.6
    u.rayleigh.value = 2.5 - phys * 0.4 - env.weather.cover * 0.5
    // dusk aureole: a little less mie, slightly more forward-peaked. Midday unchanged.
    u.mieCoefficient.value = 0.002 - warmth * 0.0007
    u.mieDirectionalG.value = 0.76 + warmth * 0.06
    u.uSat.value = 1 + env.sun.day * (1 - phys) * 0.28
    u.uGain.value = (0.42 + phys * 0.1) * (1 - env.weather.cover * 0.12)
    u.uCover.value = Math.max(0, env.weather.cover - 0.25) / 0.75
    u.uMist.value = env.weather.mist
    u.uFogCol.value.copy((st.scene.fog as THREE.FogExp2 | null)?.color ?? WHITE)
    u.cloudCoverage.value = env.weather.cover > 0.45 ? 0.12 : 0.14 + env.weather.cover * 0.2
    u.cloudDensity.value = 0.28 + env.weather.cover * 0.4
    // debug / for user feedback
    ;(window as unknown as { __sunLook: unknown }).__sunLook = {
      mode: look.mode,
      warmth: +warmth.toFixed(3),
      hue: look.hue,
      physicalWarmth: +phys.toFixed(3),
      elev: +elev.toFixed(2),
      rgb: [+dr.toFixed(3), +dg.toFixed(3), +db.toFixed(3)],
      disc: look.mode === 'manual' ? 'manual' : 'physical',
      hour: +hour.toFixed(2),
    }
  })
  return <primitive object={sky} />
}
