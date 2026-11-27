import { SECTION } from './section';

export const descentGateKinds = ['laser-matrix', 'laser-slice', 'laser-weave'] as const;
export type DescentGateKind = typeof descentGateKinds[number];
export const isDescentGate = (kind: string): kind is DescentGateKind =>
  (descentGateKinds as readonly string[]).includes(kind);

export const descentDirections = ['Right', 'Upper right', 'Top', 'Upper left', 'Left', 'Lower left', 'Bottom', 'Lower right'] as const;
const lanes = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
const { a, b } = SECTION;
export const matrixCell = [a * 2 / 3, b * 2 / 3] as const;
export const matrixSubdivisions = 3;
export const laserBandPitch = .31;
export const weaveCrossPitch = 2.3;
export const laserBeamRadius = { outline: .050, matrix: .032, bank: .042, weaveCross: .032 } as const;
const diagonal = Math.SQRT1_2;

// Matrix uses two intersecting bands; Slice and Weave use one in the actual beam plane.
// A null second axis leaves the safety band unbounded in that direction.
export function laserOpening(kind: DescentGateKind, open: number, axis: 0 | 1) {
  const [column, row] = lanes[open];
  if (kind === 'laser-matrix') {
    return { target: [column * matrixCell[0], row * matrixCell[1]], normal: [1, 0],
      extent: [matrixCell[0] / 2, matrixCell[1] / 2] } as const;
  }
  if (kind === 'laser-slice') {
    return axis === 0 ? { target: [column * 2.08, 0], normal: [1, 0], extent: [1.02, null] } as const
      : { target: [0, row * 1.62], normal: [0, 1], extent: [.90, null] } as const;
  }
  const sign = axis === 0 ? 1 : -1;
  const offset = Math.sign(column - row * sign) * 1.42;
  return { target: [offset * diagonal, -offset * diagonal * sign], normal: [diagonal, -diagonal * sign],
    extent: [.91, null] } as const;
}

const nearestLine = (offset: number, period: number) => Math.abs(offset - Math.round(offset / period) * period);

/** Positive in the large opening and in the gaps between the energized beam bodies. */
export function laserClearance(kind: DescentGateKind, open: number, axis: 0 | 1, x: number, y: number) {
  const { target, normal, extent } = laserOpening(kind, open, axis);
  const dx = x - target[0], dy = y - target[1];
  const across = Math.abs(dx * normal[0] + dy * normal[1]) - extent[0];
  const wall = Math.min(a - Math.abs(x), b - Math.abs(y), (a + b - SECTION.ch - Math.abs(x) - Math.abs(y)) * diagonal);
  if (extent[1] === null) {
    if (across < 0) return -across;
    const line = nearestLine(across - laserBandPitch / 2, laserBandPitch);
    const clearance = Math.min(wall - laserBeamRadius.outline, across - laserBeamRadius.outline, line - laserBeamRadius.bank);
    if (kind !== 'laser-weave') return clearance;
    const transverse = -x * normal[1] + y * normal[0];
    return Math.min(clearance, nearestLine(transverse - weaveCrossPitch / 2, weaveCrossPitch) - laserBeamRadius.weaveCross);
  }
  const rim = Math.max(across, Math.abs(dy) - extent[1]);
  if (rim < 0) return -rim;
  const [w, h] = matrixCell;
  const divider = Math.min(Math.abs(Math.abs(x) - w / 2), Math.abs(Math.abs(y) - h / 2));
  const line = Math.min(nearestLine(x + a, w / matrixSubdivisions), nearestLine(y + b, h / matrixSubdivisions));
  return Math.min(Math.min(wall, divider) - laserBeamRadius.outline, line - laserBeamRadius.matrix);
}
