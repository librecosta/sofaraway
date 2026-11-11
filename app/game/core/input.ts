import { clampSection, RANGE_X, RANGE_Y } from './collision';
import type { Point } from './collision';

export interface InputFrame {
  readonly axisX: number;
  readonly axisY: number;
  readonly target: Point | null;
  readonly dragX: number;
  readonly dragY: number;
  readonly boosting: boolean;
}

export const idleInput: InputFrame = {
  axisX: 0, axisY: 0, target: null, dragX: 0, dragY: 0, boosting: false,
};

export function steer(input: InputFrame, tx: number, ty: number, dt: number): Point {
  const x = input.target?.[0] ?? tx;
  const y = input.target?.[1] ?? ty;
  return clampSection(x + input.dragX * RANGE_X * 2 / 0.62 + input.axisX * 6.2 * dt,
    y - input.dragY * RANGE_Y * 2 / 0.62 + input.axisY * 6.2 * dt, 0.34);
}
