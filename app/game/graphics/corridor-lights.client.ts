import * as THREE from 'three';
import { circumference, corridorAt, FLOW_WAVELENGTH, perimeter, washFaceProjection,
  washPitch, washStart, washWidth } from '../core/lighting-atlas';
import type { CorridorLight, CorridorLightingKind, LightingZone } from '../core/lighting-atlas';
import type { PlayMode } from '../contracts';
import { breath, lightingState, mixHue } from '../core/lighting-score';
import type { LightPattern } from '../core/lighting-score';
import { pathFrame } from './branch-path';
import type { Path } from './path';

export interface LightingPreview {
  readonly beat: number;
  readonly pattern?: LightPattern;
  readonly yaw?: number;
  readonly station?: number;
}

/** Decode authored sRGB swatches locally; the other volumes keep their existing color management. */
export function linearSwatch(hex: string) {
  const rgb = Number.parseInt(hex.slice(1), 16);
  return new THREE.Color().setRGB((rgb >> 16) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255).convertSRGBToLinear();
}
const warmBase = linearSwatch('#E5D7C5');
const coolBase = linearSwatch('#ABC1D5');
const groundBase = linearSwatch('#777B81');
const BUCKET = 105;
const LOOK_AHEAD = 275;
const fixtureStyle: Record<CorridorLight['style'], number> = { flow: 0, lens: 1, wash: 2, rake: 3 };
const wallCircumference = circumference.toFixed(8);
const vertexShader = /* glsl */ `
  uniform vec3 washOrigin;
  uniform vec3 washForward;
  uniform vec3 washRight;
  uniform vec3 washUp;
  uniform vec3 washFaces[8];
  varying vec3 fixture;
  varying vec3 world;
  varying vec2 lensUv;
  varying vec2 washCoordinate;
  varying float viewDepth;
  void main() {
    fixture = instanceColor;
    lensUv = uv;
    vec4 p = modelMatrix * instanceMatrix * vec4(position, 1.0);
    world = p.xyz;
    washCoordinate = vec2(0.0);
    if (fixture.y > 1.5 && fixture.y < 2.5) {
      vec3 delta = world - washOrigin;
      vec3 wall = vec3(dot(delta, washRight), dot(delta, washUp), 1.0);
      washCoordinate = vec2(dot(wall, washFaces[int(fixture.z + 0.5)]), dot(delta, washForward));
    }
    vec4 view = viewMatrix * p;
    viewDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;
const fragmentShader = /* glsl */ `
  uniform vec3 mainHue;
  uniform vec3 alternateHue;
  uniform vec3 flowStart;
  uniform vec3 flowForward;
  uniform float flowPhase;
  uniform float pulse;
  uniform float motion;
  uniform vec3 washRange;
  varying vec3 fixture;
  varying vec3 world;
  varying vec2 lensUv;
  varying vec2 washCoordinate;
  varying float viewDepth;
  float ease(float x) {
    float t = clamp(x, 0.0, 1.0);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }
  float distanceToStrand(float wall) {
    float phase = wall / (${wallCircumference} * 0.5);
    return abs(fract(phase + 0.5) - 0.5) * (${wallCircumference} * 0.5);
  }
  void main() {
    vec2 edge = abs(2.0 * lensUv - 1.0);
    float gain = pulse;
    float diffusion = 0.0;
    float group = fixture.z;
    if (fixture.y < 0.5) {
      float along = dot(world - flowStart, flowForward);
      float wave = 0.5 + 0.5 * cos(6.2831853 * (along / ${FLOW_WAVELENGTH.toFixed(1)} - flowPhase - fixture.z * 0.5));
      gain += motion * 0.25 * wave * wave;
    } else if (fixture.y < 1.5) {
      gain *= 1.0 - smoothstep(0.34, 1.0, edge.y);
      diffusion = 0.12;
    } else if (fixture.y < 2.5) {
      float s = washCoordinate.y;
      float wall = washCoordinate.x;
      float center = ${washStart.toFixed(8)} + s * ${wallCircumference} / washRange.x;
      float offset = distanceToStrand(wall - center);
      if (offset >= ${washWidth / 2}) discard;
      float horizontal = distanceToStrand(wall - ${(perimeter[1] / 2).toFixed(8)});
      gain *= (1.0 - smoothstep(0.06, ${washWidth / 2}, offset));
      gain *= mix(0.18, 1.0, smoothstep(0.8, 3.15, horizontal));
      gain *= ease(s / washRange.z) * ease((washRange.y - s) / washRange.z);
      group = 0.0;
    } else {
      float tail = smoothstep(0.0, 0.36, lensUv.y) * (1.0 - smoothstep(0.76, 1.0, lensUv.y));
      gain *= (1.0 - smoothstep(0.16, 1.0, edge.x)) * tail;
      diffusion = 0.08;
    }
    float fog = exp(-0.0062 * 0.0062 * viewDepth * viewDepth) * (1.0 - smoothstep(175.0, 250.0, viewDepth));
    vec3 hue = mix(mainHue, alternateHue, group);
    gl_FragColor = vec4(mix(hue, vec3(1.0), diffusion) * fixture.x * gain * fog, 1.0);
  }
`;

interface Bucket {
  from: number;
  to: number;
  mesh: THREE.InstancedMesh;
  afterglow: boolean;
}

/** The game and Debug share these fixed, wall-mounted batches and the same uniforms. */
export class CorridorLights {
  readonly group = new THREE.Group();
  readonly base = warmBase;
  readonly sky = coolBase;
  readonly ground = groundBase;
  readonly fog = new THREE.Color();
  private readonly quad = new THREE.PlaneGeometry(1, 1);
  private readonly uniforms = {
    mainHue: { value: new THREE.Color() }, alternateHue: { value: new THREE.Color() },
    flowStart: { value: new THREE.Vector3() }, flowForward: { value: new THREE.Vector3() },
    flowPhase: { value: 0 }, pulse: { value: 1 }, motion: { value: 1 },
    washOrigin: { value: new THREE.Vector3() }, washForward: { value: new THREE.Vector3() },
    washRight: { value: new THREE.Vector3() }, washUp: { value: new THREE.Vector3() },
    washFaces: { value: washFaceProjection.map(face => new THREE.Vector3(...face)) },
    washRange: { value: new THREE.Vector3() },
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms, vertexShader, fragmentShader,
    side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    forceSinglePass: true,
  });
  private readonly buckets: Bucket[] = [];
  private readonly scratch = new THREE.Color();
  private readonly reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  groups = 0;
  count = 0;
  batches = 0;
  zone: CorridorLightingKind = 'pure-frame';
  hue = 0;
  reduced = false;
  private outroAtlas: readonly LightingZone[] = [];
  afterglow?: LightingZone['afterglow'];

  constructor(private readonly path: Path, private readonly atlas: readonly LightingZone[], mode: PlayMode) {
    const wash = atlas.find(zone => zone.kind === 'helical-wash');
    if (wash) {
      const frame = path.sample(wash.start);
      this.uniforms.washOrigin.value.copy(frame.p);
      this.uniforms.washForward.value.copy(frame.f);
      this.uniforms.washRight.value.copy(frame.r);
      this.uniforms.washUp.value.copy(frame.u);
      this.uniforms.washRange.value.set(washPitch(mode), wash.end - wash.start, wash.margin);
    }
    this.addZones(atlas);
  }

  setAfterglow(atlas: readonly LightingZone[]) {
    for (let i = this.buckets.length - 1; i >= 0; i--) {
      const bucket = this.buckets[i];
      if (!bucket.afterglow) continue;
      this.group.remove(bucket.mesh);
      bucket.mesh.dispose();
      this.buckets.splice(i, 1);
    }
    this.outroAtlas = atlas;
    this.addZones(atlas);
  }

  private addZones(atlas: readonly LightingZone[]) {
    for (const zone of atlas) {
      const batches = new Map<number, CorridorLight[]>();
      for (const light of zone.lights) {
        const key = Math.floor((light.start + light.end) / (2 * BUCKET));
        const batch = batches.get(key);
        if (batch) batch.push(light);
        else batches.set(key, [light]);
      }
      const flow = zone.kind === 'connected-flow' ? this.path.sample(zone.start) : undefined;
      for (const fixtures of batches.values()) this.addBatch(fixtures, zone, flow);
    }
  }

  private addBatch(lights: readonly CorridorLight[], zone: LightingZone, flow?: ReturnType<Path['sample']>) {
    const mesh = new THREE.InstancedMesh(this.quad, this.material, lights.length);
    mesh.name = 'elsewhere-' + zone.kind;
    if (flow) mesh.onBeforeRender = () => {
      this.uniforms.flowStart.value.copy(flow.p);
      this.uniforms.flowForward.value.copy(flow.f);
      this.material.uniformsNeedUpdate = true;
    };
    const entry = pathFrame(), exit = pathFrame(), matrix = new THREE.Matrix4();
    const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
    const origin = new THREE.Vector3(), endpoint = new THREE.Vector3();
    const midpoint = (target: THREE.Vector3, frame: typeof entry, [lo, hi]: CorridorLight['entry']) =>
      target.copy(frame.p).addScaledVector(frame.r, (lo.x + hi.x) / 2).addScaledVector(frame.u, (lo.y + hi.y) / 2);
    let from = Infinity, to = -Infinity;
    for (const [i, light] of lights.entries()) {
      from = Math.min(from, light.start); to = Math.max(to, light.end);
      this.path.sample(light.start, entry);
      this.path.sample(light.end, exit);
      const [lo, hi] = light.entry;
      x.copy(entry.r).multiplyScalar(hi.x - lo.x).addScaledVector(entry.u, hi.y - lo.y);
      midpoint(origin, entry, light.entry);
      midpoint(endpoint, exit, light.exit);
      y.subVectors(endpoint, origin);
      origin.lerp(endpoint, .5);
      // Keep the narrow core flush to the wall with a short optical falloff on either side.
      if (light.style === 'lens') y.multiplyScalar(2.8);
      z.crossVectors(x, y).normalize();
      mesh.setMatrixAt(i, matrix.makeBasis(x, y, z).setPosition(origin));
      const channel = light.style === 'wash' ? lo.edge : light.group;
      mesh.setColorAt(i, this.scratch.setRGB(light.level, fixtureStyle[light.style], channel));
    }
    mesh.computeBoundingSphere();
    mesh.visible = false;
    this.buckets.push({ mesh, from, to, afterglow: !!zone.afterglow });
    this.group.add(mesh);
  }

  update(station: number, beat: number, override?: LightPattern, closing = false) {
    const reduced = this.reduced = this.reduce?.matches ?? false;
    const state = lightingState(beat, reduced, closing);
    const active = corridorAt(this.atlas, station) ?? corridorAt(this.outroAtlas, station);
    this.afterglow = active?.afterglow;
    this.zone = active?.kind ?? 'pure-frame';
    this.groups = active?.dual ? 2 : 0;
    this.hue = state.hue;
    this.count = this.batches = 0;
    for (const { mesh, from, to } of this.buckets) {
      mesh.visible = from <= station + LOOK_AHEAD && to >= station - 16;
      if (mesh.visible) {
        this.count += mesh.count;
        this.batches++;
      }
    }
    const dual = active?.dual && override === 'dual-color' && !reduced;
    const { mainHue, alternateHue, flowPhase, pulse, motion } = this.uniforms;
    mainHue.value.setHSL(state.hue, state.saturation, .5);
    alternateHue.value.setHSL(dual ? mixHue(state.hue, state.hue + .27, .22 * (.5 + .5 * breath(beat, 8))) : state.hue,
      state.saturation, .5);
    flowPhase.value = (beat % 4) / 4;
    pulse.value = (.84 + .07 * state.breathing + .12 * state.energy * state.pulse) * state.level;
    motion.value = reduced ? 0 : state.level;
    this.fog.copy(this.sky).lerp(this.scratch.setHSL(state.hue, .61 * state.saturation, .12), .56).multiplyScalar(.041);
    return state;
  }

  dispose() {
    for (const { mesh } of this.buckets) mesh.dispose();
    this.material.dispose();
    this.quad.dispose();
    this.group.clear();
  }
}
