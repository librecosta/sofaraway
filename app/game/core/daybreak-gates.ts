import { SECTION, SECTION_OUTLINE } from './section';

export type GateVertex = readonly [x: number, y: number];
type Polygon = readonly GateVertex[];
type Edge = readonly [from: GateVertex, to: GateVertex];

export const daybreakGateKinds = ['daybreak-crystal', 'daybreak-vertical', 'daybreak-horizontal'] as const;
export type DaybreakGateKind = typeof daybreakGateKinds[number];

export const crystalOpenings = ['Right', 'Upper right', 'Top', 'Upper left', 'Left', 'Lower left', 'Bottom', 'Lower right'] as const;

export const daybreakGates = {
  'daybreak-crystal': { label: 'Crystal', openings: crystalOpenings },
  'daybreak-vertical': { label: 'Vertical', openings: ['Center'] },
  'daybreak-horizontal': { label: 'Horizontal', openings: ['Center'] },
} as const;

export function isDaybreakGate(kind: string): kind is DaybreakGateKind {
  return Object.hasOwn(daybreakGates, kind);
}

const { a, b, ch } = SECTION;
const HUB_APOTHEM = 1.12;
const sliceAngle = Math.PI / 4;
const turn = Math.PI * 2;
const edges = (pane: Polygon): Edge[] => pane.map((p, i) => [p, pane[(i + 1) % pane.length]]);
const shellEdges = edges(SECTION_OUTLINE);

export function isCabinEdge(from: GateVertex, to: GateVertex) {
  return shellEdges.some(([[x, y], [qx, qy]]) => [from, to].every(([px, py]) =>
    Math.abs((qx - x) * (py - y) - (qy - y) * (px - x)) < 1e-7));
}

function clearance(pane: Polygon, x: number, y: number) {
  let distance = Infinity;
  for (let i = 0; i < pane.length; i++) {
    const [px, py] = pane[i], [qx, qy] = pane[(i + 1) % pane.length];
    const dx = qx - px, dy = qy - py;
    distance = Math.min(distance, (dx * (y - py) - dy * (x - px)) / Math.hypot(dx, dy));
  }
  return distance;
}

const angleFrom = ([x, y]: GateVertex, start: number) => (Math.atan2(y, x) - start + 2 * turn) % turn;

function cabinRay(angle: number): GateVertex {
  const x = Math.cos(angle), y = Math.sin(angle);
  const distance = Math.min(a / Math.abs(x), b / Math.abs(y), (a + b - ch) / (Math.abs(x) + Math.abs(y)));
  return [distance * x, distance * y];
}

function cabinCorners(start: number, sweep: number) {
  return SECTION_OUTLINE.filter(point => {
    const angle = angleFrom(point, start);
    return angle > 1e-7 && angle < sweep - 1e-7;
  }).sort((p, q) => angleFrom(p, start) - angleFrom(q, start));
}

interface DaybreakProfile {
  readonly pane: Polygon;
  readonly hole?: Polygon;
  readonly rim: readonly Edge[];
  readonly seams: readonly Edge[];
  readonly gap?: Polygon;
  readonly target: GateVertex;
}

function crystalProfiles(): DaybreakProfile[] {
  const start = -.5 * sliceAngle;
  const radius = HUB_APOTHEM / Math.cos(sliceAngle / 2);
  const hub = Array.from({ length: 8 }, (_, i): GateVertex => {
    const angle = start + i * sliceAngle;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  const outside = hub.map((_, i) => cabinRay(start + i * sliceAngle));
  const spokes = hub.map((point, i): Edge => [point, outside[i]]);
  const hubEdges = edges(hub);
  const variants = crystalOpenings.map((_, i): DaybreakProfile => {
    const next = (i + 1) % crystalOpenings.length;
    const low = start + i * sliceAngle;
    const high = low + sliceAngle;
    const gap = [hub[i], outside[i], ...cabinCorners(low, sliceAngle), outside[next], hub[next]];
    const pane = [outside[next], ...cabinCorners(high, turn - sliceAngle), outside[i], hub[i], hub[next]];
    const center = low + sliceAngle / 2;
    const target: GateVertex = [Math.cos(center) * 2.08, Math.sin(center) * 2.08];
    return { pane, gap, rim: edges(gap).filter(([p, q]) => !isCabinEdge(p, q)),
      seams: [...spokes.filter((_, index) => index !== i && index !== next), ...hubEdges.filter((_, index) => index !== i)], target };
  });
  return [...variants, { pane: SECTION_OUTLINE, rim: [], seams: [...spokes, ...hubEdges], target: [0, 0] }];
}

function centeredWindow(hole: Polygon, connectors: readonly GateVertex[]): DaybreakProfile {
  return { pane: SECTION_OUTLINE, hole, gap: hole, rim: edges(hole),
    seams: connectors.map(point => [point, cabinRay(Math.atan2(point[1], point[0]))]), target: [0, 0] };
}

const verticalWindow = [[-.68, -1.63], [.68, -1.63], [1.11, -1.20], [1.11, 1.20],
  [.68, 1.63], [-.68, 1.63], [-1.11, 1.20], [-1.11, -1.20]] as const;
const horizontalWindow = [[-1.85, 0], [-.96, -1.12], [.96, -1.12], [1.85, 0], [.96, 1.12], [-.96, 1.12]] as const;
const verticalConnectors = [-1, 1].flatMap(x => [-1, 1].map((y): GateVertex => [x * .895, y * 1.415]));

const profiles = {
  'daybreak-crystal': crystalProfiles(),
  'daybreak-vertical': [centeredWindow(verticalWindow, verticalConnectors)],
  'daybreak-horizontal': [centeredWindow(horizontalWindow, horizontalWindow)],
};

export function daybreakProfile(kind: DaybreakGateKind, open: number): DaybreakProfile {
  return profiles[kind][open === -1 ? crystalOpenings.length : open];
}

export function daybreakOpening(kind: DaybreakGateKind, open: number, x: number, y: number) {
  const gap = daybreakProfile(kind, open)?.gap;
  return !!gap && clearance(gap, x, y) > 0;
}
