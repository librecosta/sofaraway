import * as THREE from 'three';
import type { EffectMaterialId } from './presets';

export function createEffect(id: EffectMaterialId) {
  if (id === 'emissive-channel-cyan') return new THREE.MeshBasicMaterial({ color: 0x2caaa7, toneMapped: false });
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vec2 d = min(vUv, 1.0 - vUv);
        float e = min(d.x, d.y);
        float rim = exp(-e * 42.0);
        float phase = vUv.y * 14.0 - uTime * 0.65;
        float line = abs(fract(phase - 0.5) - 0.5);
        float aa = max(fwidth(phase), 0.001);
        float scan = (1.0 - smoothstep(0.045, 0.045 + aa, line)) * (1.0 - smoothstep(0.15, 0.45, aa));
        float dy = (vUv.y - fract(uTime * 0.17)) * 10.0;
        float sweep = exp(-dy * dy);
        gl_FragColor = vec4(vec3(0.09, 0.66, 0.67), 0.10 + rim * 0.23 + scan * 0.10 + sweep * 0.08);
        #include <colorspace_fragment>
      }
    `,
  });
}
