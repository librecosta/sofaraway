import * as THREE from 'three';
import { IndustrialSurface, industrialSurfacePeriod } from './industrial-geometry';

export function facilityStructureMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: 'facility-structure', vertexColors: true, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec4 industrialSurface;
      varying vec4 vIndustrialSurface;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vIndustrialSurface = industrialSurface;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec4 vIndustrialSurface;

      // Fade small tooling marks before they can alias during fast flight.
      float filteredRib(float phase, float width) {
        float footprint = fwidth(phase);
        return (1.0 - smoothstep(width, width + max(0.004, footprint), abs(fract(phase + 0.5) - 0.5)))
          * (1.0 - smoothstep(0.20, 0.46, footprint));
      }
    `).replace('#include <metalnessmap_fragment>', `
      #include <metalnessmap_fragment>
      vec2 surfaceUV = vIndustrialSurface.xy;
      float finish = vIndustrialSurface.z;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.213, 0.715, 0.072))), 0.24);
      float machinedEdge = 0.0;
      if (finish < ${IndustrialSurface.Coated - .5}) {
        float phase = surfaceUV.y * ${Math.PI * 2 / industrialSurfacePeriod};
        float relief = sin(surfaceUV.x * 3.2 + sin(phase * 31.0)) * sin(phase * 43.0);
        relief *= 1.0 - smoothstep(0.2, 0.65, fwidth(surfaceUV.x + surfaceUV.y));
        roughnessFactor = 0.75 + relief * 0.047;
        metalnessFactor = 0.42;
        diffuseColor.rgb *= vec3(0.81, 0.88, 0.93) * (1.0 + relief * 0.036);
      } else if (finish < ${IndustrialSurface.Machined - .5}) {
        float join = filteredRib(surfaceUV.y * 0.0833333, 0.006);
        roughnessFactor = 0.51 + join * 0.16;
        metalnessFactor = 0.19;
        diffuseColor.rgb *= vec3(1.03, 1.10, 1.17) * (1.0 - join * 0.19);
      } else if (finish < ${IndustrialSurface.Polymer - .5}) {
        float milling = filteredRib(surfaceUV.y * 10.0, 0.10);
        float footprint = fwidth(surfaceUV.x);
        machinedEdge = step(${IndustrialSurface.Machined + .125}, finish) *
          (1.0 - smoothstep(0.021, 0.12, surfaceUV.x)) * (1.0 - smoothstep(0.085, 0.28, footprint));
        roughnessFactor = 0.34 + milling * 0.12 - machinedEdge * 0.11;
        metalnessFactor = 0.64;
        diffuseColor.rgb *= vec3(1.19, 1.26, 1.32) * (1.0 - milling * 0.09);
      } else {
        float groove = filteredRib(surfaceUV.y * 3.0, 0.08);
        roughnessFactor = 0.87 + groove * 0.05;
        metalnessFactor = 0.04;
        diffuseColor.rgb *= vec3(0.41, 0.46, 0.51) * (1.0 - groove * 0.15);
      }
    `).replace('#include <lights_fragment_end>', `
      #include <lights_fragment_end>
      // Baked irradiance from the existing work fixtures, bounded to avoid flattening the recesses.
      reflectedLight.indirectDiffuse += diffuseColor.rgb *
        (vec3(0.162, 0.169, 0.185) + vec3(0.67, 0.72, 0.77) * vIndustrialSurface.w) *
        (1.0 - 0.38 * metalnessFactor);
      reflectedLight.indirectSpecular += vec3(0.018, 0.024, 0.028) * machinedEdge *
        (0.38 + 0.62 * vIndustrialSurface.w);
    `);
  };
  return material;
}
