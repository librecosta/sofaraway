import { canPass, DIAMOND_EXTENT, HUB_R, lanePoint, opening, SQUARE_HALF } from './collision';
import type { Axis } from './collision';
import { daybreakProfile, isDaybreakGate } from './daybreak-gates';
import type { DaybreakGateKind, GateVertex } from './daybreak-gates';
import { isDescentGate, laserBeamRadius, laserClearance, laserOpening } from './descent-gates';
import type { DescentGateKind } from './descent-gates';
import { apertureClearance, apertureSizes, isOrbitGate, orbitPreset } from './orbit-gates';
import { SECTION } from './section';
import type { GateKind } from './volumes';

export type GateCrossingQuality = 'normal' | 'precision' | 'nearMiss';
export const PRECISION_SCALE = .20;
export const NEAR_MISS_SCALE = .05;
const epsilon = 1e-10;
const innerLimit = 1 - PRECISION_SCALE;
const atMost = (value: number, limit: number) => value <= limit + epsilon;
const withinSection = (x: number, y: number) => Math.abs(x) <= SECTION.a && Math.abs(y) <= SECTION.b &&
  Math.abs(x) + Math.abs(y) <= SECTION.a + SECTION.b - SECTION.ch;

function qualityFromClearance(clearance: number): GateCrossingQuality {
  return atMost(innerLimit, clearance) ? 'precision' : atMost(clearance, NEAR_MISS_SCALE) ? 'nearMiss' : 'normal';
}

function irisQuality(open: number, x: number, y: number): GateCrossingQuality {
  const [tx, ty] = lanePoint('iris', open, 0);
  const qx = tx + (x - tx) / (PRECISION_SCALE + epsilon);
  const qy = ty + (y - ty) / (PRECISION_SCALE + epsilon);
  if (withinSection(qx, qy) && canPass('iris', open, 0, qx, qy)) return 'precision';

  const radius = Math.hypot(tx, ty);
  const forward = (x * tx + y * ty) / radius;
  const sideways = (y * tx - x * ty) / radius;
  const spokeClearance = (forward - Math.abs(sideways) / Math.tan(Math.PI / 8)) / radius;
  const hubClearance = (Math.hypot(x, y) - HUB_R) / (radius - HUB_R);
  return atMost(Math.min(spokeClearance, hubClearance), NEAR_MISS_SCALE) ? 'nearMiss' : 'normal';
}

function edgeDistanceRatio([px, py]: GateVertex, [qx, qy]: GateVertex, [tx, ty]: GateVertex, x: number, y: number) {
  const dx = qx - px, dy = qy - py;
  return (dx * (y - py) - dy * (x - px)) / (dx * (ty - py) - dy * (tx - px));
}

function daybreakQuality(kind: DaybreakGateKind, open: number, x: number, y: number): GateCrossingQuality {
  const { gap, rim, target } = daybreakProfile(kind, open);
  if (gap && gap.every((point, i) => atMost(innerLimit, edgeDistanceRatio(point, gap[(i + 1) % gap.length], target, x, y)))) {
    return 'precision';
  }
  return rim.some(([from, to]) => atMost(edgeDistanceRatio(from, to, target, x, y), NEAR_MISS_SCALE)) ? 'nearMiss' : 'normal';
}

function descentQuality(kind: DescentGateKind, open: number, axis: Axis, x: number, y: number): GateCrossingQuality {
  const { target: [tx, ty], normal: [nx, ny], extent: [width, height] } = laserOpening(kind, open, axis);
  const across = (x - tx) * nx + (y - ty) * ny;
  const vertical = y - ty;
  const position = Math.max(Math.abs(across) / width, height === null ? 0 : Math.abs(vertical) / height);
  if (position >= 1) return 'normal';
  if (atMost(position, PRECISION_SCALE) &&
      (height === null || withinSection(tx + (x - tx) / PRECISION_SCALE, ty + (y - ty) / PRECISION_SCALE))) return 'precision';

  // Verify the edge borders a blocked laser band inside the cabin. Wall faces have no gate on the far side.
  function bordersLaser(coordinate: number, extent: number, dx: number, dy: number) {
    if (!atMost(1 - Math.abs(coordinate) / extent, NEAR_MISS_SCALE)) return false;
    const offset = Math.sign(coordinate) * (extent + laserBeamRadius.outline / 2) - coordinate;
    const px = x + dx * offset, py = y + dy * offset;
    return withinSection(px, py) && laserClearance(kind, open, axis, px, py) <= 0;
  }
  return bordersLaser(across, width, nx, ny) || (height !== null && bordersLaser(vertical, height, 0, 1))
    ? 'nearMiss' : 'normal';
}

/** Classifies a legal gate-local crossing. A blocked point has no quality. */
export function gateCrossingQuality(kind: GateKind, open: number, axis: Axis, x: number, y: number): GateCrossingQuality | null {
  if (!withinSection(x, y) || !Number.isInteger(open) || open !== opening(kind, open) || !canPass(kind, open, axis, x, y)) return null;
  if (isDaybreakGate(kind)) return daybreakQuality(kind, open, x, y);
  if (isDescentGate(kind)) return descentQuality(kind, open, axis, x, y);
  if (isOrbitGate(kind)) {
    // The deepest legal hole wins, so another hole's rim cannot award a near miss inside it.
    const clearance = Math.max(...orbitPreset(kind, open).holes.map(hole => {
      const radius = apertureSizes[hole.shape][hole.size] / (hole.shape === 'diamond' ? Math.SQRT2 : 1);
      return apertureClearance(hole, x, y) / radius;
    }));
    return qualityFromClearance(clearance);
  }
  if (kind === 'iris') return irisQuality(open, x, y);
  const fraction = kind === 'square' ? Math.max(Math.abs(x), Math.abs(y)) / SQUARE_HALF
    : (Math.abs(x) + Math.abs(y)) / DIAMOND_EXTENT;
  return qualityFromClearance(1 - fraction);
}
