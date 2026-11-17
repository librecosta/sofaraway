import * as THREE from 'three';
import { ControlLamp, controlLampCount, FacilityLightShape } from '../core/descent-lighting';
import { IndustrialSurface, IndustrialTrim, industrialSurfacePeriod } from './industrial-geometry';

export interface FacilityLightingUniforms {
  groups: THREE.Vector4[];
  accents: THREE.Vector3[];
  spill: THREE.Vector3[];
  motion: THREE.Vector4;
  events: THREE.Vector4;
  energy: { value: number };
  focus: { value: number };
}

const scoreUniforms = `
  uniform vec4 controlLamps[${controlLampCount}];
  uniform vec3 controlAccents[${controlLampCount}];
  uniform vec4 controlMotion; // Mix, direction, alarm, audible beat.
  uniform vec4 controlEvents; // Kick, snare, signal, sweep.
  uniform float controlEnergy;
  uniform int controlFocus;
  bool followsScore(int group) {
    return group != ${ControlLamp.Route} && (controlFocus == -1 || controlFocus == group);
  }
  float scoreWeight(int group) {
    return followsScore(group) ? controlMotion.x : 0.0;
  }
  float lane(int group) {
    if (group == ${ControlLamp.Floor} || group == ${ControlLamp.Right} || group == ${ControlLamp.DeepDeck}) return 0.5;
    if (group == ${ControlLamp.Roof} || group == ${ControlLamp.Left}) return 0.0;
    return 0.25;
  }
  float waveAt(float station, float pitch, float beatPhase) {
    return 0.5 + 0.5 * cos(6.2831853 * (station / pitch - beatPhase));
  }
  float bank(int group, float station) {
    float beat = controlMotion.w;
    float phase = lane(group);
    float forward = waveAt(station, 32.0, beat / 8.0 + phase);
    float backwards = waveAt(station, 32.0, -beat / 8.0 + phase);
    return mix(forward, backwards, 0.5 - 0.5 * controlMotion.y);
  }
  vec4 lampAt(int group, float station) {
    vec4 cue = controlLamps[group];
    float weight = scoreWeight(group);
    if (weight <= 0.0) return cue;
    float local = bank(group, station);
    float flash = controlEvents.x * 0.14;
    float dim = 0.37 + 0.74 * local;
    if (group == ${ControlLamp.Alarm}) {
      float phase = station / 32.0;
      float reply = waveAt(station, 32.0, controlMotion.w / 4.0 + 0.09 * sin(phase * 6.2831853));
      dim = mix(dim, 0.20 + 1.14 * reply * reply, controlMotion.z);
      flash += 0.32 * controlEvents.y * controlMotion.z * reply;
    }
    float depth = weight * (0.24 + 0.76 * controlEnergy);
    cue.rgb = mix(cue.rgb, controlAccents[group], clamp((0.12 + 0.60 * local + flash) * depth, 0.0, 0.8));
    cue.w *= mix(1.0, dim + flash, depth);
    return cue;
  }
`;

const scoreValues = (score: FacilityLightingUniforms) => ({
  controlLamps: { value: score.groups }, controlAccents: { value: score.accents },
  controlMotion: { value: score.motion }, controlEvents: { value: score.events }, controlFocus: score.focus,
  controlEnergy: score.energy,
});

export function facilityLampMaterial(score: FacilityLightingUniforms) {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, toneMapped: false,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, scoreValues(score));
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec2 industrialLight;
      varying vec2 fixtureLens;
      varying float lensMix;
      ${scoreUniforms}
    `).replace('#include <color_vertex>', `
      #include <color_vertex>
      int group = int(industrialLight.y + 0.5);
      vec4 cue = lampAt(group, industrialLight.x);
      bool primaryLens = group == ${ControlLamp.Roof} || group == ${ControlLamp.Floor};
      float weight = followsScore(group) ? (primaryLens ? 0.95 : 0.72) : 0.0;
      fixtureLens = uv;
      lensMix = primaryLens ? weight : 0.0;
      vColor.rgb = mix(vColor.rgb, cue.rgb * mix(1.0, 1.23, lensMix), weight) * max(cue.w, 0.14);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec2 fixtureLens;
      varying float lensMix;
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 edge = abs(2.0 * fixtureLens - 1.0);
      float lens = 1.0 - 0.34 * smoothstep(0.53, 1.0, max(edge.x, edge.y));
      diffuseColor.rgb *= mix(1.0, lens, lensMix);
    `);
  };
  return material;
}

/** Wall-mounted instanced optics share the fixture colors but have their own spatial envelopes. */
export function facilityInstallationMaterial(score: FacilityLightingUniforms) {
  return new THREE.ShaderMaterial({
    name: 'facility-installation',
    uniforms: scoreValues(score),
    side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */ `
      ${scoreUniforms}
      attribute vec4 lightSpan;
      attribute float lightFade;
      varying vec2 lens;
      varying vec4 span;
      varying float depth;
      varying float fade;
      varying vec4 fixtureTone;
      void main() {
        lens = uv;
        span = lightSpan;
        fade = lightFade;
        float station = lightSpan.x + (uv.y - 0.5) * lightSpan.y;
        fixtureTone = lampAt(int(lightSpan.z + 0.5), station);
        vec4 view = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        depth = -view.z;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      ${scoreUniforms}
      varying vec2 lens;
      varying vec4 span; // Station, signed run length, lamp group, shape plus sector offset.
      varying float depth;
      varying float fade;
      varying vec4 fixtureTone;
      const vec3 steady[] = vec3[](
        vec3(0.19, 0.37, 0.55), vec3(0.13, 0.46, 0.59), vec3(0.41, 0.29, 0.63),
        vec3(0.16, 0.35, 0.55), vec3(0.66, 0.37, 0.14), vec3(0.14, 0.41, 0.52)
      );
      void main() {
        int group = int(span.z + 0.5);
        if (controlFocus >= 0 && controlFocus != group) discard;
        float motion = scoreWeight(group);
        float style = floor(span.w);
        float offset = fract(span.w);
        float station = span.x + (lens.y - 0.5) * span.y;
        float beat = controlMotion.w;
        float x = abs(lens.x * 2.0 - 1.0);
        float y = abs(lens.y * 2.0 - 1.0);
        float wing = (1.0 - smoothstep(0.18, 1.0, x));
        float end = 1.0 - smoothstep(0.61, 1.0, y);
        float core = 1.0 - smoothstep(0.06, 0.40, x);
        float fog = exp(-0.000027 * depth * depth) * fade;
        float steadyEnd = style == ${FacilityLightShape.Flow}.0 || style == ${FacilityLightShape.Release}.0 ? 1.0 : end;
        vec3 restTone = mix(steady[int(style)], fixtureTone.rgb, 0.46);
        vec4 idle = vec4(restTone, 0.25 * fog * (0.83 * core + 0.17 * wing) * steadyEnd);
        if (motion <= 0.001) {
          gl_FragColor = idle;
          return;
        }
        float accent = 0.0;
        if (style == ${FacilityLightShape.Cell}.0) {
          float chase = waveAt(station, 32.0, beat / 4.0 + offset);
          accent = 0.24 + chase * chase * (1.24 + 0.34 * controlEvents.z);
        } else if (style == ${FacilityLightShape.Flow}.0) {
          float push = waveAt(station, 64.0, beat / 4.0 + offset);
          float pull = waveAt(station, 64.0, -beat / 4.0 + offset);
          float packet = mix(push, pull, 0.5 - 0.5 * controlMotion.y);
          accent = 0.22 + packet * packet * (1.40 + 0.48 * controlEvents.w);
          end = 1.0;
        } else if (style == ${FacilityLightShape.Rake}.0) {
          float roll = waveAt(station + lens.y * 8.0, 64.0, beat / 6.0 + offset);
          accent = 0.31 + roll * roll * (1.64 + 0.46 * controlEvents.w);
        } else if (style == ${FacilityLightShape.Stator}.0) {
          float turn = waveAt(station, 128.0, beat / 16.0 + offset);
          accent = 0.16 + turn * turn * 1.17;
          end = 1.0 - 0.66 * smoothstep(0.77, 1.0, y);
        } else if (style == ${FacilityLightShape.Lock}.0) {
          float relay = waveAt(station, 32.0, beat / 4.0 + offset + 0.095 * sin(station * 0.23));
          accent = 0.11 + relay * relay * (0.46 + 0.50 * controlMotion.z + 0.31 * controlEvents.x);
        } else {
          float wave = waveAt(station, 128.0, beat / 12.0 + offset);
          accent = 0.18 + wave * 0.64 + 0.26 * controlEvents.w;
          end = 1.0;
        }
        float falloff = (0.65 * core + 0.35 * wing) * end;
        vec3 glow = mix(fixtureTone.rgb, controlAccents[group], min(accent * 0.25, 0.52));
        gl_FragColor = mix(idle, vec4(glow * (0.88 + 0.43 * core), fog * falloff * accent * fixtureTone.w), motion);
      }
    `,
  });
}

export function facilityStructureMaterial(fill: THREE.Color, security: THREE.Color, score: FacilityLightingUniforms) {
  const material = new THREE.MeshStandardMaterial({
    name: 'facility-structure', vertexColors: true, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.facilityFill = { value: fill };
    shader.uniforms.facilitySecurity = { value: security };
    shader.uniforms.controlSpill = { value: score.spill };
    Object.assign(shader.uniforms, scoreValues(score));
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec4 industrialSurface;
      attribute vec2 industrialSpill;
      varying vec4 vIndustrialSurface;
      varying vec3 vFixtureTint;
      uniform vec3 controlSpill[${controlLampCount}];
      ${scoreUniforms}
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vIndustrialSurface = industrialSurface;
      int group = int(industrialSpill.x + 0.5);
      float weight = scoreWeight(group);
      float pass = bank(group, industrialSpill.y);
      vFixtureTint = controlSpill[group] * mix(1.0, 0.62 + 0.79 * pass + 0.16 * controlEvents.x, weight);
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
