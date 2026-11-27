import * as THREE from 'three';
import { ControlLamp, controlLampCount, FacilityLightShape } from '../core/descent-lighting';
import { descentRouteSwatches } from '../core/descent-routes';
import { IndustrialSurface, IndustrialTrim, industrialSurfacePeriod } from './industrial-geometry';

export interface FacilityLightingUniforms {
  groups: THREE.Vector4[];
  accents: THREE.Vector3[];
  spill: THREE.Vector3[];
  motion: THREE.Vector4;
  events: THREE.Vector4;
  energy: { value: number };
  focus: { value: number };
  spatial: THREE.Vector4;
  security: THREE.Vector2;
  transfer: THREE.Vector3;
}

const scoreUniforms = `
  uniform vec4 controlLamps[${controlLampCount}];
  uniform vec3 controlAccents[${controlLampCount}];
  uniform vec4 controlMotion; // Mix, direction, alarm, audible beat.
  uniform vec4 controlEvents; // Kick, snare, signal, sweep.
  uniform float controlEnergy;
  uniform int controlFocus;
  uniform vec4 controlSpatial; // Viewer station, motion, shaft activation, CORE precharge.
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
  float spatialSpill(int group, float station) {
    if (controlFocus != -1 && controlFocus != group) return 1.0;
    float beat = controlMotion.w;
    float motion = controlSpatial.y;
    if (group == ${ControlLamp.Deck} || group == ${ControlLamp.DeepDeck}) {
      float lag = group == ${ControlLamp.Deck} ? 0.0 : 0.24;
      float pass = waveAt(station, 128.0, beat / 12.0 - lag);
      return 1.0 + motion * ((0.42 + 0.35 * controlSpatial.z) * pass * pass - 0.20);
    }
    if (group == ${ControlLamp.Stator}) {
      return 1.0 + motion * (0.35 * waveAt(station, 128.0, beat / 24.0) - 0.14);
    }
    if (group == ${ControlLamp.Alarm}) {
      return 1.0 + motion * (0.45 * waveAt(station, 64.0, beat / 6.0) - 0.20);
    }
    return 1.0;
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
  controlEnergy: score.energy, controlSpatial: { value: score.spatial },
});

const routeColors = Object.values(descentRouteSwatches).map(color => new THREE.Color(color));

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
    uniforms: { ...scoreValues(score), controlSecurity: { value: score.security }, controlTransfer: { value: score.transfer },
      routeColors: { value: routeColors } },
    side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */ `
      ${scoreUniforms}
      attribute vec4 lightSpan;
      attribute vec3 lightCue;
      varying vec2 lens;
      varying vec4 span;
      varying float depth;
      varying vec3 cue; // Station fade, normalized room progress, physical layer.
      varying vec4 fixtureTone;
      void main() {
        lens = uv;
        span = lightSpan;
        cue = lightCue;
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
      varying vec3 cue;
      varying vec4 fixtureTone;
      uniform vec2 controlSecurity; // Arming and shutdown fronts.
      uniform vec3 controlTransfer; // Preview, choice, merge stations.
      uniform vec3 routeColors[3];
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
        float fog = exp(-0.000027 * depth * depth) * cue.x;
        float progress = cue.y;
        float layer = cue.z;
        float spatialMotion = controlSpatial.y;
        float profile = 0.65 * core + 0.35 * wing;
        if (style == ${FacilityLightShape.Transfer}.0) {
          float observer = controlSpatial.x;
          float reveal = mix(0.30, 1.0, smoothstep(controlTransfer.x - 50.0, controlTransfer.x + 8.0, observer));
          float committed = smoothstep(controlTransfer.y, controlTransfer.y + 14.0, observer);
          float merge = smoothstep(0.81, 1.0, progress);
          float sideTrack = step(0.72, offset);
          float spine = waveAt(station, 72.0, -beat / 12.0);
          float shuttle = waveAt(station, 62.0, beat * (layer > 1.5 ? 0.146 : 0.22) + layer * 0.29);
          float pass = mix(spine, shuttle, sideTrack * (1.0 - merge));
          float quiet = 0.2 + 0.8 * committed;
          float gather = (1.0 - merge * sideTrack) * (1.0 - smoothstep(controlTransfer.z - 9.0, controlTransfer.z, observer));
          float drive = spatialMotion * quiet * pass * pass * (0.98 + 0.30 * controlEvents.w);
          gl_FragColor = vec4(routeColors[int(layer + 0.5)] * (0.72 + 0.32 * core),
            min(0.82, (0.13 + drive) * fog * profile * reveal * gather));
          return;
        }
        if (style == ${FacilityLightShape.Rake}.0) {
          float open = smoothstep(0.02 + 0.08 * layer, 0.53 + 0.10 * layer, progress + 0.17 * controlSpatial.z);
          float quiet = 1.0 - 0.76 * smoothstep(0.81, 1.0, progress);
          float slope = (lens.y - 0.5) * mix(12.0, -12.0, step(0.4, offset));
          float pass = waveAt(station + slope, 128.0, beat / 12.0 - layer * 0.21);
          float tierGain = mix(1.0, 1.28, layer * 0.5);
          float lamp = 0.17 + spatialMotion * pass * pass * (1.26 + 0.38 * controlEvents.w + 0.20 * controlEvents.y);
          vec3 color = mix(vec3(0.30, 0.14, 0.74), fixtureTone.rgb, 0.46);
          color = mix(color, vec3(0.46, 0.64, 1.0), layer * 0.23);
          gl_FragColor = vec4(color, min(0.87, lamp * quiet * profile * end * tierGain *
            exp(-0.000017 * depth * depth) * cue.x * mix(layer > 0.5 ? 0.11 : 0.54, 1.0, open)));
          return;
        }
        if (style == ${FacilityLightShape.Stator}.0) {
          float angle = offset + (lens.y - 0.5) / 24.0;
          float turn = waveAt(angle, 1.0, beat / 24.0 - layer * 0.18 - station / 256.0);
          float heartbeat = waveAt(station, 216.0, beat / 12.0 - layer * 0.16);
          float pass = smoothstep(0.54, 0.96, turn) * (0.44 + 0.56 * heartbeat);
          vec3 cold = mix(vec3(0.08, 0.33, 0.65), fixtureTone.rgb, 0.31);
          vec3 heat = vec3(0.70, 0.27, 0.11);
          float charge = smoothstep(0.50, 0.94, progress) * (0.15 + 0.33 * controlSpatial.w);
          float intensity = (0.12 + spatialMotion * pass * (layer < 0.5 ? 1.75 : 1.42)) * fog * profile;
          gl_FragColor = vec4(mix(cold, heat, charge) * (0.83 + 0.32 * core), min(intensity, 0.82));
          return;
        }
        if (style == ${FacilityLightShape.Lock}.0 || style == ${FacilityLightShape.Interlock}.0) {
          bool leaving = style == ${FacilityLightShape.Interlock}.0;
          float phase = beat / 6.0 + offset * 0.19 - layer * 0.10;
          phase += leaving ? progress * (0.27 + 0.83 * controlSecurity.y) : 0.035 * sin(station * 0.22);
          float pass = waveAt(station, 64.0, phase);
          float response = smoothstep(0.48, 0.94, pass);
          float warning = leaving ? 1.0 - smoothstep(progress - 0.16, progress + 0.15, controlSecurity.y) :
            mix(0.32, 1.0, smoothstep(progress - 0.10, progress + 0.08, controlSecurity.x));
          float impulse = spatialMotion * response * (0.82 + 0.28 * controlEvents.x + 0.14 * controlEvents.y);
          vec3 color = mix(vec3(0.85, 0.055, 0.022), vec3(1.0, 0.51, 0.075),
            clamp(offset + spatialMotion * 0.32 * pass, 0.0, 1.0));
          gl_FragColor = vec4(color, min(0.86, (0.20 + impulse) * warning * profile * end * fog));
          return;
        }
        if (style == ${FacilityLightShape.Release}.0) {
          float crest = waveAt(station, 144.0, beat / 16.0 + offset * 0.2);
          vec3 color = mix(vec3(0.23, 0.45, 0.62), vec3(0.57, 0.85, 0.97), controlSecurity.y);
          gl_FragColor = vec4(color, (0.21 + 0.25 * controlSecurity.y + 0.39 * (1.0 - controlSecurity.y) *
            spatialMotion * crest) * profile * fog);
          return;
        }
        float steadyEnd = style == ${FacilityLightShape.Flow}.0 ? 1.0 : end;
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
        } else {
          float push = waveAt(station, 64.0, beat / 4.0 + offset);
          float pull = waveAt(station, 64.0, -beat / 4.0 + offset);
          float packet = mix(push, pull, 0.5 - 0.5 * controlMotion.y);
          accent = 0.22 + packet * packet * (1.40 + 0.48 * controlEvents.w);
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
      vFixtureTint = controlSpill[group] * mix(1.0, 0.62 + 0.79 * pass + 0.16 * controlEvents.x, weight)
        * spatialSpill(group, industrialSpill.y);
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
