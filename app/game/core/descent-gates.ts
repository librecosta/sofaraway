import { SECTION } from './section';

export const descentGateKinds = ['laser-matrix', 'laser-slice', 'laser-weave'] as const;
export type DescentGateKind = typeof descentGateKinds[number];
export const isDescentGate = (kind: string): kind is DescentGateKind =>
  (descentGateKinds as readonly string[]).includes(kind);

export const descentDirections = ['Right', 'Upper right', 'Top', 'Upper left', 'Left', 'Lower left', 'Bottom', 'Lower right'] as const;
const lanes = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
const { a, b } = SECTION;
export const matrixCell = [a * 2 / 3, b * 2 / 3] as const;
export const laserBandPitch = .31;
export const laserCoreRadius = laserBandPitch / 2;
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

/** Positive inside the opening. The optical core ends on this same contour. */
export function laserClearance(kind: DescentGateKind, open: number, axis: 0 | 1, x: number, y: number) {
  const { target, normal, extent } = laserOpening(kind, open, axis);
  const dx = x - target[0], dy = y - target[1];
  const primary = extent[0] - Math.abs(dx * normal[0] + dy * normal[1]);
  return extent[1] === null ? primary : Math.min(primary, extent[1] - Math.abs(dy));
}
