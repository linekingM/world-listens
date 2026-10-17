import * as THREE from 'three'
import { Effect, EffectAttribute } from 'postprocessing'

/**
 * Occlusion-correct light shafts: a short radial gather toward the sun's screen position that only collects
 * *sky* pixels (cleared depth) close to the sun. Islands, buildings and trees in front of the sun block it
 * completely; their silhouettes just pick up a soft warm rim where open sky sits right behind the edge.
 * Replaces the god-ray pass whose light-source depth mask let the whole sun bleed through occluders.
 */
export class SunShaftsEffect extends Effect {
  constructor() {
    super('SunShafts', /* glsl */`
      uniform vec2 uSun; uniform float uStrength; uniform vec3 uTint; uniform float uAspect;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        if (uStrength <= 0.0) { outputColor = inputColor; return; }
        const int N = 28;
        // march toward the sun, but at most ~0.3 of the screen (long marches leak sky light deep into occluders);
        // per-pixel jitter hides the step pattern
        vec2 toSun = uSun - uv;
        float len = length(toSun);
        vec2 delta = len > 0.0 ? toSun / len * min(len, 0.3) / float(N) : vec2(0.0);
        float jit = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 c = uv + delta * jit; float decay = 1.0, acc = 0.0;
        for (int i = 0; i < N; i++) {
          c += delta;
          if (c.x >= 0.0 && c.x <= 1.0 && c.y >= 0.0 && c.y <= 1.0) {
            float sky = step(0.99999, readDepth(c));
            vec2 q = (c - uSun) * vec2(uAspect, 1.0);
            acc += sky * exp(-dot(q, q) * 70.0) * decay;
          }
          decay *= 0.955;
        }
        acc = clamp(acc / float(N) * 3.0, 0.0, 1.0);
        // objects in front of the sun keep a clean silhouette: only a faint warm rim on their own pixels
        float self = step(0.99999, depth);
        outputColor = vec4(inputColor.rgb + uTint * (acc * uStrength * mix(0.18, 1.0, self)), inputColor.a);
      }`, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['uSun', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uStrength', new THREE.Uniform(0)],
        ['uTint', new THREE.Uniform(new THREE.Color(1, 0.8, 0.55))],
        ['uAspect', new THREE.Uniform(1)],
      ]),
    })
  }
}
