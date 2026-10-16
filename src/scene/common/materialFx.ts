import * as THREE from 'three'
import { fxUniforms } from './env'

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0]

function chain(mat: THREE.Material, key: string, fn: (s: Shader) => void) {
  const prev = mat.onBeforeCompile.bind(mat)
  const prevKey = mat.customProgramCacheKey.bind(mat)
  mat.onBeforeCompile = (s, r) => { prev(s, r); fn(s) }
  mat.customProgramCacheKey = () => prevKey() + key
  mat.needsUpdate = true
  return mat
}

const WIND_FN = /* glsl */`
  uniform float uTime; uniform float uWind;
  vec3 windOffset(vec3 wp, float h, float k){
    float t = uTime * 1.3;
    float w = sin(t + wp.x * 0.07 + wp.z * 0.05) * 0.6 + sin(t * 2.3 + wp.x * 0.21) * 0.25 + sin(t * 0.6 + wp.z * 0.02) * 0.5;
    return vec3(w, 0.0, w * 0.6) * h * k * uWind;
  }`

/** Sway vertices by their local height (trees, grass). Works with instancing. */
export function addWind(mat: THREE.Material, strength: number, heightScale: number) {
  return chain(mat, `wind${strength}-${heightScale}`, (s) => {
    s.uniforms.uTime = fxUniforms.uTime
    s.uniforms.uWind = fxUniforms.uWind
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + WIND_FN)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp0 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp0 = instanceMatrix * wp0;
          #endif
          wp0 = modelMatrix * wp0;
          float h = clamp(position.y / ${heightScale.toFixed(2)}, 0.0, 1.0);
          transformed += windOffset(wp0.xyz, h * h, ${strength.toFixed(3)});
        }`)
  })
}

/** Moving cloud shadows + gentle grass shimmer on the terrain. */
export function addTerrainFx(mat: THREE.Material) {
  return chain(mat, 'terrainfx', (s) => {
    s.uniforms.uTime = fxUniforms.uTime
    s.uniforms.uCloudShadow = fxUniforms.uCloudShadow
    s.uniforms.uSunDir = fxUniforms.uSunDir
    s.uniforms.uValley = fxUniforms.uValley
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldP; uniform float uTime; uniform float uCloudShadow; uniform vec3 uSunDir; uniform float uValley;
        float th(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vWorldP.xz;
          // wind shimmer: travelling bands of slightly lighter grass
          float sh = tn(p * 0.08 + vec2(uTime * 0.35, uTime * 0.12)) * 0.6 + tn(p * 0.31 - vec2(uTime * 0.6, 0.0)) * 0.4;
          diffuseColor.rgb *= 0.96 + sh * 0.08;
          // fine grain variation
          diffuseColor.rgb *= 0.97 + tn(p * 0.045) * 0.06 + tn(p * 1.3) * 0.03;
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          // drifting cloud shadows dim direct light only
          vec2 cp = vWorldP.xz * 0.006 + vec2(uTime * 0.012, uTime * 0.004);
          float c = tn(cp) * 0.65 + tn(cp * 2.3) * 0.35;
          float shadow = smoothstep(0.52, 0.75, c) * uCloudShadow;
          reflectedLight.directDiffuse *= 1.0 - shadow;
          reflectedLight.directSpecular *= 1.0 - shadow;
          // stylised ramp: lit grass warms/brightens, shade cools toward teal instead of going muddy
          float litAmt = clamp(dot(reflectedLight.directDiffuse, vec3(0.333)) * 1.6, 0.0, 1.0);
          reflectedLight.directDiffuse *= mix(vec3(1.0), vec3(1.08, 1.06, 0.88), litAmt);
          reflectedLight.indirectDiffuse *= vec3(0.92, 1.02, 1.1);
        }`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        #ifdef USE_FOG
        {
          // low-lying haze pooling in the valleys, thicker at golden hour / in mist
          float dCam = length(vWorldP.xz - cameraPosition.xz);
          float valley = smoothstep(6.0, -2.0, vWorldP.y) * smoothstep(60.0, 240.0, dCam);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(valley * uValley, 0.0, 0.32));
        }
        #endif`)
  })
}

/** Golden-hour glints on city windows (window mask = dark cells of the facade map). */
export function addWindowGlints(mat: THREE.MeshStandardMaterial) {
  return chain(mat, 'glints', (s) => {
    s.uniforms.uSunView = fxUniforms.uSunView
    s.uniforms.uSunCol = fxUniforms.uSunCol
    s.uniforms.uGlint = fxUniforms.uGlint
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunView; uniform vec3 uSunCol; uniform float uGlint;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef USE_MAP
        {
          float wm = 1.0 - smoothstep(0.62, 0.8, texture2D(map, vMapUv).r);
          vec3 Vv = normalize(-vViewPosition);
          vec3 Rr = reflect(-Vv, normal);
          float g = pow(max(dot(Rr, normalize(uSunView)), 0.0), 24.0);
          totalEmissiveRadiance += uSunCol * g * wm * uGlint * 4.0;
        }
        #endif`)
  })
}

/** Leaves: soft rim + back-lit translucency (light glowing through the canopy edges toward a low sun). */
export function addLeafGlow(mat: THREE.Material, k = 1) {
  return chain(mat, 'leafglow' + k, (s) => {
    s.uniforms.uSunView = fxUniforms.uSunView
    s.uniforms.uSunCol = fxUniforms.uSunCol
    s.uniforms.uLeafGlow = fxUniforms.uLeafGlow
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunView; uniform vec3 uSunCol; uniform float uLeafGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 Vv = normalize(vViewPosition);
          float rim = pow(1.0 - clamp(abs(dot(normal, Vv)), 0.0, 1.0), 2.2);
          float back = pow(max(dot(-Vv, normalize(uSunView)), 0.0), 3.0);
          float facing = max(dot(normal, normalize(uSunView)), 0.0);
          totalEmissiveRadiance += diffuseColor.rgb * uSunCol * uLeafGlow * ${k.toFixed(2)} * (rim * (0.12 + facing * 0.25 + back * 1.1) + back * 0.18);
        }`)
  })
}

/** Scale fog on one material (keeps floating islands readable as silhouettes in golden haze). */
export function addFogScale(mat: THREE.Material, k: number) {
  return chain(mat, 'fogk' + k, (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactorK = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogFactorK = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactorK * ${k.toFixed(2)});
    #endif`)
  })
}

/** Flagstone paving from the road ribbon UVs (u across 0..1, v along in road widths); fades with distance. */
export function addFlagstones(mat: THREE.Material) {
  return chain(mat, 'flags', (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFlagUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlagUv = uv;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vFlagUv;
        float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vec2(vFlagUv.x * 3.2, vFlagUv.y * 3.6);
          float row = floor(p.y);
          p.x += fh(vec2(row, 3.0)) * 0.9 + row * 0.37;
          vec2 id = floor(p), f = fract(p);
          // slightly irregular stone outlines
          f += (vec2(fh(id + 1.3), fh(id + 7.1)) - 0.5) * 0.08;
          float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
          float aa = max(fwidth(p.x), fwidth(p.y));
          float mortar = (1.0 - smoothstep(0.035, 0.035 + aa * 1.5 + 0.02, e)) * (1.0 - smoothstep(0.15, 0.5, aa));
          float tone = fh(id);
          vec3 stone = diffuseColor.rgb * (0.84 + tone * 0.3) * mix(vec3(1.0), vec3(1.05, 0.98, 0.9), step(0.6, fh(id + 4.0)));
          stone *= 0.94 + 0.12 * smoothstep(0.0, 0.25, e); // soft bevel
          diffuseColor.rgb = mix(stone, diffuseColor.rgb * vec3(0.55, 0.6, 0.45), mortar * 0.85);
        }`)
  })
}

/** Canopy shading: keep the baked (spherical) normals on both faces of double-sided leaf cards
 *  instead of flipping them, so a crown shades as one soft volume rather than a mess of cards. */
export function addCanopyNormals(mat: THREE.Material) {
  return chain(mat, 'canopyN', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
  })
}
