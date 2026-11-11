import type { Obstacle } from './volumes';

export const SECTION = { a: 3.75, b: 2.95, ch: 1.20 } as const;
export const WALL = { w: SECTION.a * 2 + 0.20, h: SECTION.b * 2 + 0.20 };
export const HUB_R = 1.02;
export const HOLE_R = 0.95;
export const RANGE_X = SECTION.a - 0.32;
export const RANGE_Y = SECTION.b - 0.32;
export type Axis = 0 | 1;
export type Point = [x: number, y: number];

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function clampSection(x: number, y: number, margin: number): Point {
  const ax = SECTION.a - margin;
  const ay = SECTION.b - margin;
  const diagonal = SECTION.a + SECTION.b - SECTION.ch - margin * 1.9;
  const px = clamp(x, -ax, ax);
  const py = clamp(y, -ay, ay);
  const d = Math.abs(px) + Math.abs(py);
  return d > diagonal ? [px * diagonal / d, py * diagonal / d] : [px, py];
}

export function opening(obstacle: Obstacle, sector: number) {
  const lanes = obstacle === 'lattice' ? 9 : obstacle === 'shutter' ? 3 : 8;
  const pick = ((sector % lanes) + lanes) % lanes;
  return obstacle === 'lattice' && pick === 4 ? 5 : pick;
}

export function lanePoint(obstacle: Obstacle, index: number, axis: Axis): Point {
  if (obstacle === 'lattice') {
    return [
      ((index % 3 + 0.5) / 3 - 0.5) * WALL.w,
      ((Math.floor(index / 3) + 0.5) / 3 - 0.5) * WALL.h,
    ];
  }
  if (obstacle === 'shutter') {
    const v = (index + 0.5) / 3 - 0.5;
    return axis ? [v * WALL.w, 0] : [0, v * WALL.h];
  }
  const angle = index * Math.PI / 4;
  return [Math.cos(angle) * 2.15, Math.sin(angle) * 2.15];
}

/** The shader clips to the same octagonal section. Inputs are clamped inside it. */
export function canPass(obstacle: Obstacle, open: number, axis: Axis, x: number, y: number) {
  const u = x / WALL.w + 0.5;
  const v = y / WALL.h + 0.5;
  switch (obstacle) {
    case 'aperture': {
      const [cx, cy] = lanePoint(obstacle, open, axis);
      return Math.hypot(x - cx, y - cy) < HOLE_R;
    }
    case 'lattice':
      return open !== 4 && Math.floor(v * 3) * 3 + Math.floor(u * 3) === open;
    case 'shutter':
      return Math.floor((axis ? u : v) * 3) === open;
    case 'iris': {
      if (Math.hypot(x, y) < HUB_R) return false;
      const turn = Math.PI * 2;
      const angle = ((Math.atan2(y, x) + turn + Math.PI / 8) % turn + turn) % turn;
      return Math.floor(angle / (Math.PI / 4)) % 8 === open;
    }
  }
}
