import * as THREE from 'three';
import { IndustrialSurface, IndustrialTrim, industrialSurfacePeriod } from './industrial-geometry';

export function facilityStructureMaterial(fill: THREE.Color, security: THREE.Color) {
  const material = new THREE.MeshStandardMaterial({
    name: 'facility-structure', vertexColors: true, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.facilityFill = { value: fill };
    shader.uniforms.facilitySecurity = { value: security };
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
      uniform vec3 facilityFill;
      uniform vec3 facilitySecurity;

      float filteredRib(float phase, float width, float footprint) {
        float centre = abs(fract(phase + 0.5) - 0.5);
        return (1.0 - smoothstep(width, width + max(0.012, footprint), centre))
          * (1.0 - smoothstep(0.12, 0.40, footprint));
      }
    `).replace('#include <metalnessmap_fragment>', `
      #include <metalnessmap_fragment>
      vec2 surfaceUV = vIndustrialSurface.xy;
      vec2 footprint = fwidth(surfaceUV);
      float finish = floor(vIndustrialSurface.z + 0.001);
      float trim = vIndustrialSurface.z - finish;
      float machinedEdge = 0.0;
      float cavity = 1.0;
      if (finish == ${IndustrialSurface.Cast}.0) {
        float phase = surfaceUV.y * ${Math.PI * 2 * 15 / industrialSurfacePeriod};
        float relief = sin(phase) * sin(surfaceUV.x * 1.7);
        relief *= 1.0 - smoothstep(0.15, 0.60, max(footprint.x, footprint.y));
        roughnessFactor = 0.78 + relief * 0.075;
        metalnessFactor = 0.47;
        diffuseColor.rgb *= vec3(0.91, 0.99, 1.04) * (1.0 + relief * 0.045);
      } else if (finish < ${IndustrialSurface.Machined - .5}) {
        float join = filteredRib(surfaceUV.y / 12.0, 0.010, footprint.y / 12.0);
        roughnessFactor = 0.48 + join * 0.22;
        metalnessFactor = 0.16;
        diffuseColor.rgb *= vec3(1.27, 1.18, 1.04) * (1.0 - join * 0.22);
      } else if (finish < ${IndustrialSurface.Polymer - .5}) {
        float milling = filteredRib(surfaceUV.y * 3.0, 0.13, footprint.y * 3.0);
        float lip = 1.0 - step(0.125, abs(trim - ${IndustrialTrim.PolishedLip}));
        machinedEdge = lip * (1.0 - smoothstep(0.042, 0.23 + footprint.x, surfaceUV.x)) *
          (1.0 - smoothstep(0.14, 0.45, footprint.x));
        roughnessFactor = 0.38 + milling * 0.12 - machinedEdge * 0.13;
        metalnessFactor = 0.71;
        float steelGrey = dot(diffuseColor.rgb, vec3(0.213, 0.715, 0.072));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(steelGrey), 0.30);
        diffuseColor.rgb *= vec3(1.42, 1.39, 1.32) * (1.0 - milling * 0.075);
      } else {
        roughnessFactor = 0.94;
        metalnessFactor = 0.02;
        cavity = 0.55;
        diffuseColor.rgb *= vec3(0.52, 0.55, 0.58);
      }
    `).replace('#include <lights_fragment_end>', `
      #include <lights_fragment_end>
      float work = vIndustrialSurface.w;
      reflectedLight.indirectDiffuse += diffuseColor.rgb *
        (facilityFill * cavity + vec3(0.77, 0.88, 1.0) * work) * (1.0 - 0.38 * metalnessFactor);
      float glancing = 1.0 - clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
      reflectedLight.indirectSpecular += vec3(0.041, 0.054, 0.064) * machinedEdge *
        (0.28 + work) * (0.52 + 0.48 * glancing * glancing);
      reflectedLight.indirectSpecular += facilitySecurity * step(0.375, trim) * (0.5 + 0.5 * glancing);
    `);
  };
  return material;
}
