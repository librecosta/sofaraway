import type { ChartGate } from './chart';
import type { RouteKind } from './branches';

type Insertion = readonly [after: number, kind: 'iris' | 'square' | 'diamond', sector?: number];

// Indices name the gap after a Hard anchor within each section. Added gates
// sit halfway between anchors and keep the original opening on each anchor.
const mainInsertions: Readonly<Record<string, readonly Insertion[]>> = {
  A: [[2, 'square'], [8, 'diamond'], [15, 'square']],
  B: [[2, 'iris', 6], [6, 'iris', 6], [10, 'iris', 6], [14, 'iris', 6]],
  BUILD: [[1, 'square'], [2, 'iris', 5], [4, 'square'], [6, 'iris', 5], [8, 'diamond']],
  DROP: [[0, 'iris', 6], [2, 'iris', 6], [4, 'iris', 1], [5, 'iris', 1], [7, 'iris', 2],
    [9, 'iris', 7], [10, 'iris', 7], [14, 'iris', 5], [15, 'iris', 6], [17, 'iris', 7],
    [20, 'iris', 5], [23, 'iris', 2], [30, 'iris', 0], [35, 'iris', 0], [37, 'iris', 4]],
  A2: [[12, 'iris', 2], [16, 'iris', 1], [19, 'iris', 3]],
  FINALE: [[0, 'iris', 3], [4, 'iris', 0], [7, 'iris', 6], [9, 'iris', 7], [12, 'iris', 6],
    [14, 'square'], [17, 'iris', 2], [19, 'iris', 3], [24, 'square'], [26, 'iris', 5]],
};

const routeInsertions: Readonly<Record<RouteKind, readonly Insertion[]>> = {
  main: [[0, 'iris', 3], [2, 'iris', 4], [5, 'iris', 5]],
  challenge: [[0, 'iris', 1], [2, 'iris', 2], [4, 'iris', 5], [5, 'iris', 6], [9, 'iris', 1]],
  score: [],
};

function insert(anchors: readonly ChartGate[], additions: readonly Insertion[]): ChartGate[] {
  return additions.map(([index, kind, sector = 0]) => ({ beat: (anchors[index].beat + anchors[index + 1].beat) / 2,
    section: anchors[index].section, kind, sector, inserted: true }));
}

export function impossibleChart(hard: ChartGate[]) {
  const additions = Object.entries(mainInsertions).flatMap(([section, gaps]) =>
    insert(hard.filter(gate => gate.section === section), gaps));
  return [...hard, ...additions].sort((a, b) => a.beat - b.beat);
}

export function impossibleRoutes(routes: Record<RouteKind, ChartGate[]>) {
  const extend = (route: RouteKind) => [...routes[route], ...insert(routes[route], routeInsertions[route])]
    .sort((a, b) => a.beat - b.beat);
  return { main: extend('main'), challenge: extend('challenge'), score: routes.score };
}
