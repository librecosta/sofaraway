import * as THREE from 'three';
import { DIAMOND_EXTENT, HUB_R, SECTION, SQUARE_HALF } from '../core/collision';
import type { GateKind } from '../core/volumes';

export type GlassKind = Extract<GateKind, 'iris' | 'square' | 'diamond'>;
export const GLASS_THICKNESS = 0.38;
const BEVEL_WIDTH = 0.035;
const BEVEL_DEPTH = 0.055;
const HUB_ARC_SEGMENTS = 32;
const SQRT2 = Math.SQRT2;
const TURN = Math.PI * 2;
const WEDGE = Math.PI / 8;

export function isOpticalGlass(kind: GateKind): kind is GlassKind {
  return kind === 'iris' || kind === 'square' || kind === 'diamond';
}

function hull(inset: number) {
  const { a, b, ch } = SECTION;
  const x = a - inset;
  const y = b - inset;
  const diagonal = a + b - ch - inset * SQRT2;
  return [[x, diagonal - x], [diagonal - y, y], [y - diagonal, y], [-x, diagonal - x],
    [-x, x - diagonal], [y - diagonal, -y], [diagonal - y, -y], [x, x - diagonal]]
    .map(([px, py]) => new THREE.Vector2(px, py));
}

// The parallel bevel profiles move the two cut edges into the glass. Intersect
// each with the inset octagon and the hub circle, keeping corresponding vertices.
function irisContour(open: number, inset: number, outside: THREE.Vector2[]) {
  const center = open * Math.PI / 4;
  const lower = center - WEDGE;
  const upper = center + WEDGE;
  const radius = HUB_R - inset;
  const arcOffset = Math.asin(inset / radius);
  const { a, b, ch } = SECTION;
  const diagonal = a + b - ch - inset * SQRT2;
  const planes = [[1, 0, a - inset], [-1, 0, a - inset], [0, 1, b - inset], [0, -1, b - inset],
    [1, 1, diagonal], [-1, 1, diagonal], [-1, -1, diagonal], [1, -1, diagonal]];
  const rayEnd = (angle: number, shift: number) => {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const x = -dy * shift, y = dx * shift;
    let distance = Infinity;
    for (const [nx, ny, limit] of planes) {
      const toward = nx * dx + ny * dy;
      if (toward > 1e-8) distance = Math.min(distance, (limit - nx * x - ny * y) / toward);
    }
    return new THREE.Vector2(x + dx * distance, y + dy * distance);
  };
  const angleFromUpper = (p: THREE.Vector2) => (Math.atan2(p.y, p.x) - upper + TURN * 2) % TURN;
  const corners = outside.filter(p => angleFromUpper(p) < TURN - 2 * WEDGE)
    .sort((p, q) => angleFromUpper(p) - angleFromUpper(q));
  const arc = Array.from({ length: HUB_ARC_SEGMENTS + 1 }, (_, i) => {
    const angle = lower - arcOffset + (2 * WEDGE + 2 * arcOffset) * i / HUB_ARC_SEGMENTS;
    return new THREE.Vector2(radius * Math.cos(angle), radius * Math.sin(angle));
  });
  return [rayEnd(upper, inset), ...corners, rayEnd(lower, -inset), ...arc];
}

function profiles(kind: GlassKind, open: number, inset: number) {
  const outside = hull(inset);
  if (kind === 'iris') return [irisContour(open, inset, outside)];
  const half = SQUARE_HALF + inset;
  const tip = DIAMOND_EXTENT + inset * SQRT2;
  const hole = kind === 'square' ? [[half, half], [half, -half], [-half, -half], [-half, half]]
    : [[0, tip], [tip, 0], [0, -tip], [-tip, 0]];
  return [outside, hole.map(([x, y]) => new THREE.Vector2(x, y))];
}

/** One indexed mesh for both faces, the vertical throat and the two bevel strips. */
export function buildGlassGeometry(kind: GlassKind, open: number) {
  const bevel = profiles(kind, open, BEVEL_WIDTH);
  const throat = profiles(kind, open, 0);
  const positions: number[] = [];
  const walls: number[] = [];
  const indices: number[] = [];
  const append = (loops: THREE.Vector2[][], z: number, wall: number) => {
    const first = positions.length / 3;
    for (const loop of loops) for (const p of loop) {
      positions.push(p.x, p.y, z);
      walls.push(wall);
    }
    return first;
  };
  const faceTriangles = THREE.ShapeUtils.triangulateShape(bevel[0], bevel.slice(1));
  for (const z of [0, GLASS_THICKNESS]) {
    const first = append(bevel, z, 0);
    for (const [a, b, c] of faceTriangles) {
      if (z === 0) indices.push(first + c, first + b, first + a);
      else indices.push(first + a, first + b, first + c);
    }
  }
  const rings = [append(bevel, 0, 1), append(throat, BEVEL_DEPTH, 1),
    append(throat, GLASS_THICKNESS - BEVEL_DEPTH, 1), append(bevel, GLASS_THICKNESS, 1)];
  let offset = 0;
  for (const loop of throat) {
    for (let row = 0; row < rings.length - 1; row++) {
      for (let i = 0; i < loop.length; i++) {
        const next = (i + 1) % loop.length;
        const a = rings[row] + offset, b = rings[row + 1] + offset;
        indices.push(a + i, a + next, b + i, b + i, a + next, b + next);
      }
    }
    offset += loop.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aWall', new THREE.Float32BufferAttribute(walls, 1));
  geometry.setIndex(indices);
  return geometry;
}
