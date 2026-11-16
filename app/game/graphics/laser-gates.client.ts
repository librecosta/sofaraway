import * as THREE from 'three';
import { laserBandPitch, laserBeamRadius, laserOpening, matrixCell, matrixSubdivisions, weaveCrossPitch } from '../core/descent-gates';
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
uniform bool uMatrix, uWeave;
uniform float uTime, uFade, uHit;
const float pitch = ${laserBandPitch};

float gaussian(float distance, float sigma, float footprint) {
  float width = sqrt(sigma * sigma + footprint * footprint);
  float d = distance / width;
  return exp(-0.5 * d * d) * sigma / width;
}

vec2 nearestLine(vec2 offset, vec2 period) {
  return abs(fract(offset / period + .5) - .5) * period;
}

vec3 beamProfile(float distance, float radius, float footprint) {
  float band = clamp((radius + footprint - distance) / (2.0 * min(radius, footprint)), 0.0, 1.0)
    * min(1.0, radius / footprint);
  return vec3(gaussian(distance, radius * .42, footprint) * band, band,
    gaussian(distance, radius * 1.55, footprint));
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
  float boundary = uMatrix ? max(across, vertical) : across;
  float footprint = clamp(.44 * max(fwidth(p.x), fwidth(p.y)), .0005, .85);
  if (wall < 0.0 || boundary < 0.0) discard;

  float dividers = wall;
  float inner = abs(fract(across / pitch) - .5) * pitch;
  float innerRadius = ${laserBeamRadius.bank};
  if (uMatrix) {
    const vec2 cell = vec2(${matrixCell[0]}, ${matrixCell[1]});
    vec2 major = abs(absP - cell * .5);
    dividers = min(dividers, min(major.x, major.y));
    vec2 fine = nearestLine(p + vec2(${SECTION.a}, ${SECTION.b}), cell / ${matrixSubdivisions}.0);
    inner = min(fine.x, fine.y);
    innerRadius = ${laserBeamRadius.matrix};
  }

  // All beams contribute from the first visible frame. Pixel coverage reduces
  // subpixel energy while the open side of the aperture stays empty.
  float coarse = smoothstep(.035, .20, footprint);
  float silhouetteWidth = max(${laserBeamRadius.outline}, footprint * coarse);
  vec3 contour = beamProfile(dividers, silhouetteWidth, footprint) * mix(1.0, .53, coarse);
  vec3 aperture = beamProfile(boundary, max(${laserBeamRadius.outline}, 1.5 * footprint * coarse), footprint);
  vec3 filament = beamProfile(inner, innerRadius, footprint);
  if (uWeave) {
    const float crossPitch = ${weaveCrossPitch};
    float crossLine = abs(fract(transverse / crossPitch) - .5) * crossPitch;
    filament = max(filament, beamProfile(crossLine, ${laserBeamRadius.weaveCross}, footprint));
  }
  float filamentEnergy = mix(1.0, .25, smoothstep(.045, .24, footprint));
  vec3 beam = max(aperture, max(contour, filament * vec3(.82, .84, .78) * filamentEnergy));
  float energy = .97 + .02 * sin(p.x * 3.2 + p.y * 2.8 - uTime * 2.6)
    + .01 * sin(primary * 5.6 - transverse * 4.1 + uTime * 5.2);
  vec3 tint = mix(uColor, vec3(1.0, .20, .14), uHit * .34);
  vec3 coreColor = mix(tint, vec3(.87, .95, 1.0), .52);
  vec3 color = tint * (beam.y * .25 + beam.z * .059) + coreColor * beam.x * .55;
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
      uMatrix: { value: kind === 'laser-matrix' },
      uWeave: { value: kind === 'laser-weave' },
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
