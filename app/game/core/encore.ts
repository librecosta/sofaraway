import type { Difficulty, PlayMode } from '../contracts';
import { lanePoint, opening } from './collision';
import { orbitGateKinds } from './orbit-gates';
import { crystalOpenings } from './daybreak-gates';
import type { Axis } from './collision';
import { IMPOSSIBLE_SPEED_FACTOR } from './difficulty';
import { gameplayFor } from './gameplay';
import { referenceFor } from './reference-track';
import { runRandomWord } from './run-seed';
import type { GateKind, VolumeDefinition } from './volumes';

export const ENCORE_GATE_COUNT = 24;
export const IMPOSSIBLE_ENCORE_COUNT = 36;
export const ENCORE_FIRST_OFFSET = 140;
export const ENCORE_MIN_SPACING = 95;
export const ENCORE_MAX_SPACING = 105;
export const ENCORE_STREAM = 0x454e434f;
export const CLEAN_RADIUS = .42 * 2.2;

export type OutroPhase = 'main' | 'transition' | 'encore' | 'afterglow';
export type AfterglowStage = 'release' | 'flow' | 'luminous' | 'closing';
export interface AfterglowSection { readonly stage: AfterglowStage; readonly start: number; readonly end: number }
export interface EncoreGate {
  readonly index: number;
  readonly kind: GateKind;
  readonly sector: number;
  readonly open: number;
  readonly axis: Axis;
  readonly worldStation: number;
  routeStation: number;
  judged: boolean;
  passed: boolean;
  clean: boolean;
  neutralized: boolean;
  crossedAt?: number;
}

export interface EncoreResult {
  readonly encountered: number;
  readonly passed: number;
  readonly clean: number;
  readonly missed: number;
  readonly neutralized: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly bonusScore: number;
}

export interface OutroPlan {
  readonly seed: number;
  readonly mode: PlayMode;
  readonly mainLastStation: number;
  readonly transitionEnd: number;
  readonly gates: readonly EncoreGate[];
  readonly afterglowStart: number;
  readonly afterglowEnd: number;
  readonly musicEndStation: number;
  readonly afterglow: readonly AfterglowSection[];
}

function descentEncoreOpening(index: number, seed: number) {
  const phrase = Math.floor(index / 4);
  const direction = (seed % 4 + phrase) % 4;
  const sector = direction * 2;
  const axis: Axis = (direction % 2) as Axis;
  const mirror: Axis = ((phrase + (seed >>> 2)) % 2) as Axis;
  // A centered entry allows a reset. The next three shutters turn the same
  // corner from a cardinal opening, through a diagonal, onto the other axis.
  switch (index % 4) {
    case 0: return { kind: 'laser-slice', sector: axis === 0 ? 2 : 0, axis } as const;
    case 1: return { kind: 'laser-matrix', sector, axis: 0 } as const;
    case 2: return { kind: 'laser-weave', sector, axis: mirror } as const;
    default: {
      const [x, y] = lanePoint('laser-weave', sector, mirror);
      return { kind: 'laser-slice', sector: axis === 0 ? (y > 0 ? 2 : 6) : (x > 0 ? 0 : 4), axis: (1 - axis) as Axis } as const;
    }
  }
}

export function makeOutroPlan(volume: VolumeDefinition, mode: PlayMode, seed: number, mainLastStation: number,
  difficulty: Difficulty = 'normal', reserveStation?: (seconds: number) => number): OutroPlan {
  const impossible = mode === 'standard' && difficulty === 'impossible';
  const reference = referenceFor(volume, impossible ? difficulty : 'normal');
  const musicEndStation = reference.boostFinish(mode, impossible ? IMPOSSIBLE_SPEED_FACTOR : 1);
  // After rejoin, branch arc offsets carry through to the ending. The closing
  // frame has extra depth so either side can reach the end without seeing a seam.
  const end = musicEndStation + 72;
  const rule = gameplayFor(volume.id).encore;
  const spec = rule === 'legacy' ? undefined : rule;
  const release = spec ? 42 : 120;
  const reserveAt = volume.beats * 60 / volume.bpm - (spec?.reserve ?? 0);
  const cutoff = spec && mode === 'standard'
    ? reserveStation?.(reserveAt) ?? (volume.id === 'descent' || volume.id === 'orbit'
      ? reference.boostAt(reserveAt, mode, impossible ? IMPOSSIBLE_SPEED_FACTOR : 1) : musicEndStation - 550) : Infinity;
  const first = mainLastStation + (spec?.first ?? ENCORE_FIRST_OFFSET);
  let station = spec ? Math.max(first, reference.station(volume.beats, mode) + 12) : first;
  const gates: EncoreGate[] = [];
  const word = (index: number, field: number) => runRandomWord(seed, ENCORE_STREAM ^ Math.imul(1 + index * 3 + field, 0x9e3779b9));
  const spacingScale = impossible ? spec?.impossibleSpacing ?? 1 : 1;
  const minSpacing = (spec?.minSpacing ?? ENCORE_MIN_SPACING) * spacingScale;
  const maxSpacing = (spec?.maxSpacing ?? ENCORE_MAX_SPACING) * spacingScale;
  const kinds = spec?.kinds;
  const gateCount = mode === 'sightseeing' ? 0 : spec ? Math.max(0, Math.ceil((cutoff - station) / minSpacing))
    : impossible ? IMPOSSIBLE_ENCORE_COUNT : ENCORE_GATE_COUNT;
  for (let index = 0; index < gateCount; index++) {
    if (index) station += minSpacing + (maxSpacing - minSpacing) * word(index, 0) / 0xffffffff;
    if (station + release > cutoff) break;
    let kind: GateKind, sector: number, axis: Axis = 0;
    if (volume.id === 'descent') ({ kind, sector, axis } = descentEncoreOpening(index, word(0, 1)));
    else if (volume.id === 'orbit') {
      kind = orbitGateKinds[index % 3];
      sector = kind === 'orbit-single' ? [0, 3, 2, 4, 1, 7][Math.floor(index / 3) % 6]
        : kind === 'orbit-dual' ? Math.floor(index / 3) % 3 : Math.floor(index / 3) % 4;
      axis = 0;
    } else {
      const slot = index % 3;
      const swap = word(index - slot, 1) % 2;
      kind = kinds?.[index % kinds.length] ?? (slot === 0 ? 'iris' : slot - 1 === swap ? 'square' : 'diamond');
      sector = kind === 'iris' ? word(index, 2) % 8 : kind === 'daybreak-crystal' ? word(index, 2) % crystalOpenings.length : 0;
    }
    gates.push({ index, kind, sector, open: opening(kind, sector), axis,
      worldStation: station, routeStation: station, judged: false, passed: false, clean: false, neutralized: false });
  }
  const start = gates.length ? gates[gates.length - 1].worldStation + release : mainLastStation + (spec ? 14 : 45);
  const afterglow: AfterglowSection[] = [];
  let from = start;
  for (const [stage, fraction] of [['release', .14], ['flow', .45], ['luminous', .74], ['closing', 1]] as const) {
    const to = start + (end - start) * fraction;
    afterglow.push({ stage, start: from, end: to });
    from = to;
  }
  return { seed, mode, mainLastStation, transitionEnd: gates[0]?.worldStation ?? start, gates,
    afterglowStart: start, afterglowEnd: end, musicEndStation, afterglow };
}

export function outroPhase(plan: OutroPlan | undefined, station: number, mainComplete: boolean): OutroPhase {
  if (!plan || !mainComplete || station < plan.mainLastStation) return 'main';
  if (station >= plan.afterglowStart) return 'afterglow';
  if (station >= plan.transitionEnd && station <= (plan.gates.at(-1)?.worldStation ?? -Infinity)) return 'encore';
  return 'transition';
}

export function recordEncore(gate: EncoreGate, previous: EncoreResult | undefined, scoring = true): EncoreResult {
  const combo = gate.passed ? (previous?.combo ?? 0) + 1 : gate.neutralized ? previous?.combo ?? 0 : 0;
  return Object.freeze({
    encountered: (previous?.encountered ?? 0) + 1,
    passed: (previous?.passed ?? 0) + Number(gate.passed),
    clean: (previous?.clean ?? 0) + Number(gate.clean),
    missed: (previous?.missed ?? 0) + Number(!gate.passed && !gate.neutralized),
    neutralized: (previous?.neutralized ?? 0) + Number(gate.neutralized),
    combo, maxCombo: Math.max(previous?.maxCombo ?? 0, combo),
    bonusScore: (previous?.bonusScore ?? 0) + (scoring && gate.passed ? 200 + Number(gate.clean) * 100 : 0),
  });
}
