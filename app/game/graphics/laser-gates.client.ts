import * as THREE from 'three';
import { laserBandPitch, laserCoreRadius, laserOpening, matrixCell } from '../core/descent-gates';
import type { DescentGateKind } from '../core/descent-gates';
import { SECTION, SECTION_OUTLINE } from '../core/section';
import { IndustrialGeometry } from './industrial-geometry';

const LASER_VERT = /* glsl */`
varying vec2 vSection;
void main() {
  vSection = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const LASER_FRAG = /* glsl */`
varying vec2 vSection;
uniform vec2 uTarget, uNormal, uExtent;
uniform vec3 uColor;
uniform float uTopology, uTime, uFade, uHit;
const float pitch = ${laserBandPitch};
const float radius = ${laserCoreRadius};

float gaussian(float distance, float sigma, float footprint) {
  float width = sqrt(sigma * sigma + footprint * footprint);
  float d = distance / width;
  return exp(-0.5 * d * d) * sigma / width;
}

float repeatedBeam(float across, float period) {
  return abs(fract(across / period) - 0.5) * period;
}

vec3 beamProfile(float distance, float footprint) {
  return vec3(gaussian(distance, radius * .30, footprint),
    gaussian(distance, radius * .62, footprint), gaussian(distance, radius * 1.16, footprint));
}

void main() {
  vec2 p = vSection;
  vec2 absP = abs(p);
  float wall = min(min(${SECTION.a} - absP.x, ${SECTION.b} - absP.y),
    (${SECTION.a + SECTION.b - SECTION.ch} - absP.x - absP.y) * .70710678);
  vec2 delta = p - uTarget;
  float primary = dot(delta, uNormal);
  float across = abs(primary) - uExtent.x;
  float vertical = abs(delta.y) - uExtent.y;
  float transverse = dot(p, vec2(-uNormal.y, uNormal.x));
  bool matrix = uTopology < 0.5;
  bool weave = uTopology > 1.5;
  float boundary = matrix ? max(across, vertical) : across;

  // Keep the light stable once the fine beam spacing is subpixel, without
  // broadening the opening boundary or moving the optical core.
  float along = min(pitch * .45, .34 * fwidth(primary));
  float cross = min(pitch * .45, .34 * fwidth(matrix ? delta.y : transverse));
  float edgeFootprint = min(pitch * .45, .34 * fwidth(boundary));
  if (wall < 0.0 || boundary < 0.0) discard;

  vec3 beam = beamProfile(repeatedBeam(across, pitch), along);
  if (matrix) {
    vec2 divider = abs(absP - vec2(${matrixCell[0] / 2}, ${matrixCell[1] / 2}));
    beam = max(beam * .68, beamProfile(repeatedBeam(vertical, pitch), cross) * .68);
    float seam = gaussian(min(divider.x, divider.y), .073, edgeFootprint);
    beam = max(beam, vec3(.76, .86, .66) * seam);
  } else if (weave) {
    float anchor = gaussian(repeatedBeam(transverse, 2.3), .078, cross);
    float bank = gaussian(repeatedBeam(across, pitch * 3.0), .096, along);
    beam = max(beam * (.60 + .28 * bank), vec3(.23, .32, .30) * anchor);
  }

  vec3 rim = beamProfile(boundary - radius * .22, edgeFootprint);
  beam = max(beam, rim * vec3(.85, 1.0, .77));
  float holder = gaussian(wall, .16, .0) * beam.y;
  float energy = .965 + .025 * sin(transverse * 1.42 - uTime * 2.7)
    + .010 * sin(primary * 2.12 + transverse * .37 + uTime * 3.6);
  vec3 tint = mix(uColor, vec3(1.0, .20, .14), uHit * .34);
  vec3 coreColor = mix(tint, vec3(.83, .94, 1.0), .56);
  vec3 color = tint * (.017 + beam.y * .32 + beam.z * .085 + holder * .115)
    + coreColor * beam.x * .50;
  gl_FragColor = vec4(color * energy, uFade);
}`;

export function laserMaterial(kind: DescentGateKind, open: number, axis: 0 | 1) {
  const { target, normal, extent } = laserOpening(kind, open, axis);
  return new THREE.ShaderMaterial({
    vertexShader: LASER_VERT, fragmentShader: LASER_FRAG, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
    uniforms: {
      uTarget: { value: new THREE.Vector2(...target) }, uNormal: { value: new THREE.Vector2(...normal) },
      uExtent: { value: new THREE.Vector2(extent[0], extent[1] ?? 0) },
      uTopology: { value: kind === 'laser-matrix' ? 0 : kind === 'laser-slice' ? 1 : 2 },
      uColor: { value: new THREE.Color(0x82e8ff) }, uTime: { value: 0 }, uFade: { value: 1 }, uHit: { value: 0 },
    },
  });
}

export function laserEmitters() {
  const batch = new IndustrialGeometry();
  const forward = new THREE.Vector3(0, 0, 1);
  const metal = new THREE.Color(0x546a7c);
  const plate = new THREE.Color(0x273742);
  const housing = new THREE.Color(0x8b9ba4);
  const lens = new THREE.Color(0xa7c1cb);
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const [i, [x, y]] of SECTION_OUTLINE.entries()) {
    const [qx, qy] = SECTION_OUTLINE[(i + 1) % SECTION_OUTLINE.length];
    const a = point(x * 1.035, y * 1.035, .015), b = point(qx * 1.035, qy * 1.035, .015);
    batch.beam(a, b, forward, .095, .22, plate);
    batch.beam(a.clone().setZ(.155), b.clone().setZ(.155), forward, .052, .024, metal);
    const tangent = b.clone().sub(a).normalize();
    const inward = new THREE.Vector3(-tangent.y, tangent.x, 0);
    const count = Math.max(2, Math.floor(a.distanceTo(b) / .88));
    for (let j = 0; j < count; j++) {
      const center = a.clone().lerp(b, (j + .5) / count);
      batch.beam(center.clone().addScaledVector(tangent, -.145), center.clone().addScaledVector(tangent, .145), forward, .135, .183, housing);
      const socket = center.clone().addScaledVector(inward, .086);
      batch.beam(socket.clone().addScaledVector(tangent, -.091), socket.clone().addScaledVector(tangent, .091), forward, .055, .201, plate);
      socket.addScaledVector(inward, .043);
      batch.beam(socket.clone().addScaledVector(tangent, -.053), socket.clone().addScaledVector(tangent, .053), forward, .024, .208, lens);
    }
  }
  return batch.build();
}
