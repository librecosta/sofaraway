import * as THREE from 'three';
import { ControlLamp, controlLampCount } from '../core/descent-lighting';
import { IndustrialSurface, IndustrialTrim, industrialSurfacePeriod } from './industrial-geometry';

export interface FacilityLightingUniforms {
  groups: THREE.Vector4[];
  spill: THREE.Vector3[];
  motion: THREE.Vector4;
  focus: { value: number };
}

const scoreUniforms = `
  uniform vec4 controlLamps[${controlLampCount}];
  uniform vec4 controlMotion; // Color mix, directional movement, warning relay, music beat.
  uniform int controlFocus;
  float scoreWeight(int group) {
    return (controlFocus == -1 || controlFocus == group) ? controlMotion.x : 0.0;
  }
`;

export function facilityLampMaterial(score: FacilityLightingUniforms, color = 0xffffff) {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, toneMapped: false, color,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.controlLamps = { value: score.groups };
    shader.uniforms.controlMotion = { value: score.motion };
    shader.uniforms.controlFocus = score.focus;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec2 industrialLight;
      ${scoreUniforms}
    `).replace('#include <color_vertex>', `
      #include <color_vertex>
      int group = int(industrialLight.y + 0.5);
      vec4 cue = controlLamps[group];
      float gain = cue.w;
      if (group != ${ControlLamp.Route}) {
        float station = industrialLight.x;
        float enabled = float(controlFocus == -1 || controlFocus == group);
        float travel = controlMotion.y;
        float beat = controlMotion.w;
        if (group == ${ControlLamp.Rail} || group == ${ControlLamp.Deck} || group == ${ControlLamp.DeepDeck} ||
            group == ${ControlLamp.Left} || group == ${ControlLamp.Right}) {
          float delay = group == ${ControlLamp.DeepDeck} || group == ${ControlLamp.Right} ? 0.27 : 0.0;
          float wave = cos(6.2831853 * (station / 64.0 - sign(travel) * (beat / 7.0 - delay)));
          gain += enabled * abs(travel) * wave *
            (group == ${ControlLamp.Rail} ? 0.21 : 0.11);
        } else if (group == ${ControlLamp.Alarm}) {
          float relay = 0.5 + 0.5 * cos(6.2831853 * (station / 18.0 - beat / 4.0));
          gain += enabled * controlMotion.z * (0.31 * relay * relay - 0.07);
        }
        vColor.rgb = mix(vColor.rgb, cue.rgb, 0.73 * scoreWeight(group));
      }
      vColor.rgb *= max(gain, 0.29);
    `);
  };
  return material;
}

export function facilityStructureMaterial(fill: THREE.Color, security: THREE.Color, score: FacilityLightingUniforms) {
  const material = new THREE.MeshStandardMaterial({
    name: 'facility-structure', vertexColors: true, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.facilityFill = { value: fill };
    shader.uniforms.facilitySecurity = { value: security };
    shader.uniforms.controlSpill = { value: score.spill };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec4 industrialSurface;
      attribute float industrialSpill;
      varying vec4 vIndustrialSurface;
      varying vec3 vFixtureTint;
      uniform vec3 controlSpill[${controlLampCount}];
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vIndustrialSurface = industrialSurface;
      vFixtureTint = controlSpill[int(industrialSpill + 0.5)];
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec4 vIndustrialSurface;
      uniform vec3 facilityFill;
      uniform vec3 facilitySecurity;
      varying vec3 vFixtureTint;

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
      float work = vIndustrialSurface.w * (0.58 + 0.42 * vIndustrialSurface.w);
      reflectedLight.indirectDiffuse += diffuseColor.rgb *
        (facilityFill * cavity + vFixtureTint * work) * (1.0 - 0.38 * metalnessFactor);
      float glancing = 1.0 - clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
      reflectedLight.indirectSpecular += vec3(0.041, 0.054, 0.064) * machinedEdge *
        (0.28 + work) * (0.52 + 0.48 * glancing * glancing);
      reflectedLight.indirectSpecular += facilitySecurity * step(0.375, trim) * (0.5 + 0.5 * glancing);
    `);
  };
  return material;
}
