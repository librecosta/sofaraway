import type { Difficulty, PlayMode } from '../contracts';
import type { BranchPath } from '../graphics/branch-path';
import { inBranchWindow, sideForRoute } from './branches';
import type { BranchLayout, RouteKind, RouteSide } from './branches';
import { chartFor } from './chart';
import type { ChartGate } from './chart';
import { opening } from './collision';
import type { Axis } from './collision';
import type { ReferenceTrack } from './reference-track';
import { sightseeingChart, sightseeingRoute } from './sightseeing';
import type { GateKind, VolumeDefinition } from './volumes';

export interface RunGate {
  readonly beat: number;
  readonly kind: GateKind;
  readonly open: number;
  readonly axis: Axis;
  readonly inserted?: true;
  readonly route?: RouteKind;
  readonly worldStation: number;
  readonly routeStation: number;
  judged: boolean;
  hit: boolean;
  crossedAt?: number;
  neutralizedByRecovery?: true;
}

type RouteGates = Readonly<Record<RouteKind, readonly RunGate[]>>;
interface ChartProjection {
  readonly difficulty: Difficulty;
  readonly chartSeed: number;
  readonly mode: PlayMode;
  readonly reference: ReferenceTrack;
}

export function projectRunChart(volume: VolumeDefinition, { difficulty, chartSeed, mode, reference }: ChartProjection,
  junction?: { path: BranchPath; layout: BranchLayout }) {
  const path = junction?.path;
  const branch = path?.spec;
  const sightseeing = mode === 'sightseeing';
  const preserveMain = sightseeing && branch?.sightseeingPattern === 'preserve-main';
  const authored = chartFor(volume, difficulty, chartSeed);
  let rng = 987654321;
  function makeGate({ beat, kind, sector, inserted }: ChartGate, axis: Axis, route?: RouteKind, side: RouteSide = 'center'): RunGate {
    const worldStation = reference.station(beat, mode);
    return { beat, kind, open: opening(kind, sector), axis, worldStation,
      routeStation: route && path ? path.arcAt(worldStation, side) : worldStation,
      judged: false, hit: false, ...(inserted ? { inserted } : {}), ...(route ? { route } : {}) };
  }
  let mainGates = authored.map(gate => {
    if (gate.axis !== undefined) return makeGate(gate, gate.axis);
    let axis: Axis = 0;
    if (volume.id !== 'daybreak' && !gate.inserted && gate.kind !== 'square' && gate.kind !== 'diamond') {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      axis = rng / 0x7fffffff < 0.5 ? 0 : 1;
    }
    return makeGate(gate, axis);
  });
  let branchGates: RouteGates | null = null;
  if (branch && junction) {
    const inside = (gate: { beat: number }) => inBranchWindow(branch, gate.beat);
    const { main, challenge, score } = branch.charts(authored.filter(inside), difficulty);
    const primary = preserveMain ? sightseeingChart(mainGates, volume.sections) : mainGates;
    const challengeSide = sideForRoute(junction.layout, 'challenge'), scoreSide = sideForRoute(junction.layout, 'score');
    branchGates = {
      main: preserveMain ? primary.filter(inside).map(gate => ({ ...gate, route: 'main' }))
        : main.map(gate => makeGate(gate, gate.axis ?? 0, 'main')),
      challenge: challenge.map(gate => makeGate(gate, gate.axis ?? 0, 'challenge', challengeSide)),
      score: score.map(gate => makeGate(gate, gate.axis ?? 0, 'score', scoreSide)),
    };
    mainGates = primary.filter(gate => !inside(gate));
  }
  if (sightseeing) {
    if (!preserveMain) mainGates = sightseeingChart(mainGates, volume.sections);
    // At tour speed the wide ORBIT side arcs consume part of the final phrase.
    if (volume.id === 'orbit') mainGates = mainGates.filter(gate => gate.beat < volume.beats - 6);
    if (branchGates) {
      const { main, challenge, score } = branchGates;
      branchGates = {
        main: preserveMain ? main : sightseeingRoute(main, 'main', branch),
        challenge: sightseeingRoute(challenge, 'challenge', branch),
        score: sightseeingRoute(score, 'score', branch),
      };
    }
  }
  let suffixBySide: Record<RouteSide, RunGate[]> | undefined;
  if (path) {
    const center = mainGates.filter(gate => gate.worldStation >= path.end);
    suffixBySide = {
      center,
      left: center.map(gate => ({ ...gate, routeStation: path.arcAt(gate.worldStation, 'left') })),
      right: center.map(gate => ({ ...gate, routeStation: path.arcAt(gate.worldStation, 'right') })),
    };
  }
  return { authored, mainGates, branchGates, suffixBySide };
}

/** Membership before the split. Consumers order the gates by beat or by arc distance. */
export function gatesForRoute(main: readonly RunGate[], branches: RouteGates | null, route: RouteKind) {
  return [...main, ...(branches?.[route] ?? [])];
}
