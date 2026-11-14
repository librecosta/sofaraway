import { SECTION } from './section';

type Vertex = readonly [x: number, y: number];
type Pane = readonly Vertex[];
type Edge = readonly [from: Vertex, to: Vertex];

export const daybreakGateKinds = [
  'daybreak-funnel-down', 'daybreak-funnel-right', 'daybreak-funnel-up', 'daybreak-funnel-left',
  'daybreak-fan-upper', 'daybreak-fan-side', 'daybreak-fan-lower', 'daybreak-fan-return',
] as const;
export type DaybreakGateKind = typeof daybreakGateKinds[number];

// Coordinates from the sketches, in a square before fitting the cabin section.
const bottomLeft = [-1, -1] as const, bottomRight = [1, -1] as const;
const topLeft = [-1, 1] as const, topRight = [1, 1] as const;
const neck = [.08, -1] as const, mouthLeft = [-.78, 1] as const, mouthRight = [.93, 1] as const;
const funnel = [
  [bottomLeft, neck, mouthLeft, topLeft],
  [neck, mouthRight, mouthLeft],
  [neck, bottomRight, topRight, mouthRight],
] as const;

// A three-way joint keeps the fan from the sketch as three connected panes.
const joint = [-.64, -.59] as const, shoulder = [-.16, 1] as const, flank = [1, .07] as const;
const fan = [
  [bottomLeft, joint, shoulder, topLeft],
  [joint, flank, topRight, shoulder],
  [bottomLeft, bottomRight, flank, joint],
] as const;

const { a, b, ch } = SECTION;
const outline = [[1, 0, a], [-1, 0, a], [0, 1, b], [0, -1, b],
  [1, 1, a + b - ch], [-1, 1, a + b - ch], [-1, -1, a + b - ch], [1, -1, a + b - ch]];

function fit(pane: Pane, turns: number): Pane {
  let vertices = pane.map(([x, y]): Vertex => {
    for (let i = 0; i < turns; i++) [x, y] = [-y, x];
    return [x * a, y * b];
  });
  for (const [nx, ny, limit] of outline) {
    vertices = vertices.flatMap((p, i): Vertex[] => {
      const q = vertices[(i + 1) % vertices.length];
      const dp = limit - nx * p[0] - ny * p[1], dq = limit - nx * q[0] - ny * q[1];
      const result = dp >= 0 ? [p] : [];
      if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
        const t = dp / (dp - dq);
        result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
      return result;
    });
  }
  return vertices;
}

const sketchEdges = (pane: Pane) => pane.map((p, i): Edge => [p, pane[(i + 1) % pane.length]])
  .filter(([p, q]) => !outline.some(([x, y, limit]) =>
    Math.abs(x * p[0] + y * p[1] - limit) < 1e-7 && Math.abs(x * q[0] + y * q[1] - limit) < 1e-7));

function clearance(pane: Pane, x: number, y: number) {
  let distance = Infinity;
  for (let i = 0; i < pane.length; i++) {
    const [px, py] = pane[i], [qx, qy] = pane[(i + 1) % pane.length];
    const dx = qx - px, dy = qy - py;
    distance = Math.min(distance, (dx * (y - py) - dy * (x - px)) / Math.hypot(dx, dy));
  }
  return distance;
}

function define(family: 'A' | 'B', turns: number, missing: number, label: string) {
  const panes = (family === 'A' ? funnel : fan).map(pane => fit(pane, turns));
  const gap = panes[missing];
  const solid = panes.filter((_, i) => i !== missing);
  const rim = sketchEdges(gap);
  const seam = sketchEdges(solid[0]).filter(([p, q]) =>
    !rim.some(([from, to]) => Math.hypot(p[0] - to[0], p[1] - to[1]) < 1e-7 &&
      Math.hypot(q[0] - from[0], q[1] - from[1]) < 1e-7));
  let target: Vertex = [0, 0];
  let best = -Infinity;
  // Choose a comfortable steering target with clearance, biased toward cabin center.
  for (let ix = -30; ix <= 30; ix++) for (let iy = -23; iy <= 23; iy++) {
    const x = ix / 10, y = iy / 10;
    const score = Math.min(clearance(gap, x, y), .8) - .28 * Math.hypot(x, y);
    if (score > best) { best = score; target = [x, y]; }
  }
  return { family, turns, missing, label, panes, gap, solid, rim, seam, target };
}

export const daybreakGates = {
  'daybreak-funnel-down': define('A', 0, 1, 'Funnel · Down'),
  'daybreak-funnel-right': define('A', 1, 1, 'Funnel · Right'),
  'daybreak-funnel-up': define('A', 2, 1, 'Funnel · Up'),
  'daybreak-funnel-left': define('A', 3, 1, 'Funnel · Left'),
  'daybreak-fan-upper': define('B', 0, 1, 'Fan · Upper'),
  'daybreak-fan-side': define('B', 1, 0, 'Fan · Side'),
  'daybreak-fan-lower': define('B', 2, 2, 'Fan · Lower pane'),
  'daybreak-fan-return': define('B', 3, 1, 'Fan · Return'),
} as const;

export function isDaybreakGate(kind: string): kind is DaybreakGateKind {
  return Object.hasOwn(daybreakGates, kind);
}

export function daybreakOpening(kind: DaybreakGateKind, x: number, y: number) {
  return clearance(daybreakGates[kind].gap, x, y) > 0;
}
