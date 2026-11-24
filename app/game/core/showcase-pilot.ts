import { BRANCH_SIDE_THRESHOLD, routeSides } from './branches';
import type { RouteKind } from './branches';
import { canPass, clamp, lanePoint, RANGE_X, SECTION } from './collision';
import type { Point } from './collision';
import { IMPOSSIBLE_SPEED_FACTOR } from './difficulty';
import { idleInput, STEERING_SPEED } from './input';
import type { InputFrame } from './input';
import { apertureAnchors, isOrbitGate, orbitPreset } from './orbit-gates';
import { cruiseTarget } from './reference-motion';
import type { RunGate, Simulation } from './simulation';

type Gate = Pick<RunGate, 'kind' | 'open' | 'axis'>;
interface Crossing { station: number; openings: readonly Point[] }
interface Waypoint { station: number; target: Point }

const center: Point = [0, 0];
const maximumCruiseSpeed = cruiseTarget(Infinity) * IMPOSSIBLE_SPEED_FACTOR;

function openings({ kind, open, axis }: Gate): readonly Point[] {
  const preferred = lanePoint(kind, open, axis);
  if (!isOrbitGate(kind)) return [preferred];
  const alternatives = orbitPreset(kind, open).holes.map(({ anchor }) => [...apertureAnchors[anchor]] as Point);
  return [preferred, ...alternatives.filter(([x, y]) =>
    (x !== preferred[0] || y !== preferred[1]) && canPass(kind, open, axis, x, y))];
}

function transferCost(from: Point, to: Point, distance: number) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  return (dx * dx + dy * dy) / Math.max(1, distance);
}

/** Pick a continuous line through the real openings. Tight gaps carry more cost. */
function planLine(crossings: readonly Crossing[], start: number): Waypoint[] {
  const costs: number[][] = [];
  for (let i = crossings.length - 1; i >= 0; i--) {
    const { station, openings } = crossings[i];
    const next = crossings[i + 1];
    costs[i] = openings.map(point => next ? Math.min(...next.openings.map((target, j) =>
      transferCost(point, target, next.station - station) + costs[i + 1][j])) : 0);
  }
  let previous = { target: center, station: start };
  return crossings.map(({ station, openings }, i) => {
    let choice = 0, best = Infinity;
    for (const [j, point] of openings.entries()) {
      const cost = transferCost(previous.target, point, station - previous.station) + costs[i][j];
      if (cost < best) { best = cost; choice = j; }
    }
    return previous = { station, target: openings[choice] };
  });
}

export class ShowcasePilot {
  private readonly line: readonly Waypoint[];
  private readonly target: Point = [0, 0];
  private readonly frame = { ...idleInput, target: this.target };
  private index = 0;

  constructor(sim: Simulation, route: RouteKind) {
    const branch = sim.junctionPath;
    const side = routeSides.find(candidate => sim.branch?.layout[candidate] === route) ?? 'center';
    const arc = (station: number) => branch?.arcAt(station, side) ?? station;
    const gates = [...sim.mainGates, ...(sim.branchGates?.[route] ?? []), ...(sim.outroPlan?.gates ?? [])];
    const crossings = gates.map(gate => ({ station: arc(gate.worldStation), openings: openings(gate) }));
    if (branch) {
      const threshold = branch.spec.sideThreshold ?? BRANCH_SIDE_THRESHOLD;
      const x = Math.min(SECTION.a - .39, threshold + .65);
      crossings.push({ station: branch.split, openings: [[side === 'left' ? -x : side === 'right' ? x : 0, 0]] });
    }
    const afterglow = arc(sim.outroPlan?.afterglowStart ?? sim.reference.station(sim.volume.beats, sim.mode));
    crossings.push({ station: afterglow, openings: [center] });
    this.line = [{ station: sim.distance, target: center },
      ...planLine(crossings.sort((a, b) => a.station - b.station), sim.distance)];
  }

  input(sim: Simulation): InputFrame {
    while (this.index + 1 < this.line.length && sim.distance + 1e-8 >= this.line[this.index + 1].station) this.index++;
    const from = this.line[this.index], to = this.line[this.index + 1] ?? from;
    const [x, y] = from.target, [nextX, nextY] = to.target;
    const gap = to.station - from.station;
    const travel = Math.hypot(nextX - x, nextY - y);
    const time = .42 + travel * 1.25 / STEERING_SPEED;
    const start = Math.max(from.station, to.station - maximumCruiseSpeed * time);
    // Leave room for the normal damped camera to settle before the swept crossing.
    const end = to.station - Math.min(9, gap * .22);
    const t = gap > 0 ? clamp((sim.distance - start) / Math.max(1, end - start), 0, 1) : 1;
    const ease = t * t * (3 - 2 * t);
    this.target[0] = (x + (nextX - x) * ease) * RANGE_X / (RANGE_X + sim.steeringWidth);
    this.target[1] = y + (nextY - y) * ease;
    return this.frame;
  }
}
