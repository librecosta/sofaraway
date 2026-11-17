import { laserOpening, matrixCell } from '../core/descent-gates';
import type { DescentGateKind } from '../core/descent-gates';
import { SECTION_OUTLINE } from '../core/section';
import type { GateVertex } from '../core/daybreak-gates';
import type { Axis } from '../core/collision';

/** Clip the cabin polygon against one side of a plane in gate-local space. */
function clip(polygon: readonly GateVertex[], nx: number, ny: number, limit: number): GateVertex[] {
  const points: GateVertex[] = [];
  for (const [i, from] of polygon.entries()) {
    const to = polygon[(i + 1) % polygon.length];
    const a = nx * from[0] + ny * from[1] - limit;
    const b = nx * to[0] + ny * to[1] - limit;
    if (a <= 0) points.push(from);
    if (a * b < 0) {
      const t = a / (a - b);
      points.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    }
  }
  return points;
}

export function descentGlassPanes(kind: DescentGateKind, open: number, axis: Axis) {
  const { target, normal: [nx, ny], extent } = laserOpening(kind, open, axis);
  if (kind !== 'laser-matrix') {
    const offset = nx * target[0] + ny * target[1];
    return [clip(SECTION_OUTLINE, nx, ny, offset - extent[0]),
      clip(SECTION_OUTLINE, -nx, -ny, -offset - extent[0])];
  }

  const panes: GateVertex[][] = [];
  const [width, height] = matrixCell;
  for (const col of [-1, 0, 1]) for (const row of [-1, 0, 1]) {
    const x = col * width, y = row * height;
    if (x === target[0] && y === target[1]) continue;
    const vertical = clip(clip(SECTION_OUTLINE, 1, 0, x + width / 2), -1, 0, -x + width / 2);
    panes.push(clip(clip(vertical, 0, 1, y + height / 2), 0, -1, -y + height / 2));
  }
  return panes;
}

export function descentGlassVariant(kind: DescentGateKind, open: number, axis: Axis) {
  if (kind === 'laser-matrix') return open;
  const { target: [x, y] } = laserOpening(kind, open, axis);
  return `${axis}:${x}:${y}`;
}

export const DESCENT_GLASS_THICKNESS = .48;
