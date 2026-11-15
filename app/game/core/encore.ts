import type { Difficulty, PlayMode } from '../contracts';
import { opening } from './collision';
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

export function makeOutroPlan(volume: VolumeDefinition, mode: PlayMode, seed: number, mainLastStation: number,
  difficulty: Difficulty = 'normal', reserveStation?: (seconds: number) => number): OutroPlan {
  const impossible = mode === 'standard' && difficulty === 'impossible';
  const musicEndStation = referenceFor(volume).boostFinish(mode, impossible ? IMPOSSIBLE_SPEED_FACTOR : 1);
  // After rejoin, branch arc offsets carry through to the ending. The closing
  // frame has extra depth so either side can reach the end without seeing a seam.
  const end = musicEndStation + 72;
  const rule = gameplayFor(volume.id).encore;
  const spec = rule === 'legacy' ? undefined : rule;
  const release = spec ? 42 : 120;
  const cutoff = spec && mode === 'standard'
    ? reserveStation?.(volume.beats * 60 / volume.bpm - spec.reserve) ?? musicEndStation - 550 : Infinity;
  const first = mainLastStation + (spec?.first ?? ENCORE_FIRST_OFFSET);
  let station = spec ? Math.max(first, referenceFor(volume).station(volume.beats, mode) + 12) : first;
  const gates: EncoreGate[] = [];
  const word = (index: number, field: number) => runRandomWord(seed, ENCORE_STREAM ^ Math.imul(1 + index * 3 + field, 0x9e3779b9));
  const minSpacing = spec?.minSpacing ?? ENCORE_MIN_SPACING;
  const maxSpacing = spec?.maxSpacing ?? ENCORE_MAX_SPACING;
  const gateCount = mode === 'sightseeing' ? 0 : spec ? Math.max(0, Math.ceil((cutoff - station) / minSpacing))
    : impossible ? IMPOSSIBLE_ENCORE_COUNT : ENCORE_GATE_COUNT;
  for (let index = 0; index < gateCount; index++) {
    if (index) station += minSpacing + (maxSpacing - minSpacing) * word(index, 0) / 0xffffffff;
    if (station + release > cutoff) break;
    const slot = index % 3;
    const swap = word(index - slot, 1) % 2;
    const kind = spec?.kinds[index % spec.kinds.length] ?? (slot === 0 ? 'iris' : slot - 1 === swap ? 'square' : 'diamond');
    const sector = kind === 'iris' ? word(index, 2) % 8 : kind === 'daybreak-crystal' ? word(index, 2) % 4 : 0;
    gates.push({ index, kind, sector, open: opening(kind, sector), axis: 0,
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

export function recordEncore(gate: EncoreGate, previous: EncoreResult | undefined): EncoreResult {
  const combo = gate.passed ? (previous?.combo ?? 0) + 1 : gate.neutralized ? previous?.combo ?? 0 : 0;
  return Object.freeze({
    encountered: (previous?.encountered ?? 0) + 1,
    passed: (previous?.passed ?? 0) + Number(gate.passed),
    clean: (previous?.clean ?? 0) + Number(gate.clean),
    missed: (previous?.missed ?? 0) + Number(!gate.passed && !gate.neutralized),
    neutralized: (previous?.neutralized ?? 0) + Number(gate.neutralized),
    combo, maxCombo: Math.max(previous?.maxCombo ?? 0, combo),
    bonusScore: (previous?.bonusScore ?? 0) + (gate.passed ? 200 + Number(gate.clean) * 100 : 0),
  });
}
