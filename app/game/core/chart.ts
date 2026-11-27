/* ------------------------------------------------------------------ *
 *  Chart — the score.
 *
 *  Absolute beats author the spatial rhythm of the track. Directional gates
 *  use the sector to select the missing pane.
 *
 *  Sector index, counter-clockwise from east:
 *      0 E   1 NE   2 N   3 NW   4 W   5 SW   6 S   7 SE
 * ------------------------------------------------------------------ */

import type { Difficulty, VolumeId } from '../contracts';
import type { Axis } from './collision';
import { daybreakChart } from './daybreak-chart';
import { descentChart } from './descent-chart';
import { orbitChart } from './orbit-chart';
import { IMPOSSIBLE_LIVES, IMPOSSIBLE_SCORE_MULTIPLIER, IMPOSSIBLE_SPEED_FACTOR, resolveDifficulty } from './difficulty';
import { impossibleChart } from './impossible-chart';
import type { GateKind, VolumeDefinition } from './volumes';

export interface ChartGate {
  beat: number;
  sector: number;
  section: string;
  kind: GateKind;
  axis?: Axis;
  inserted?: true;
}

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (s: number) => ((s % 8) + 8) % 8;

function nextSector(pattern: string, prev: number, i: number, rng: () => number) {
  switch (pattern) {
    case 'sweep':
      return wrap(prev + 1);
    case 'step':
      return wrap(prev + (rng() < 0.5 ? 1 : -1));
    case 'opposite':
      return wrap(prev + 4);
    case 'zigzag':
      return wrap(prev + (i % 2 === 0 ? 3 : -3));
    case 'leap': {
      // mostly one or two steps, occasionally a big lateral cut
      const r = rng();
      if (r < 0.30) return wrap(prev + 1);
      if (r < 0.58) return wrap(prev - 1);
      if (r < 0.80) return wrap(prev + 2);
      if (r < 0.92) return wrap(prev - 2);
      return wrap(prev + 4);
    }
    default:
      return wrap(prev + 1);
  }
}

function elsewhereChart(volume: VolumeDefinition, seed: number, difficulty?: Difficulty): ChartGate[] {
  const rng = mulberry32(seed);
  const out: ChartGate[] = [];
  let beat = 0;
  let prev = 2;          // start up

  for (const sec of volume.sections) {
    const end = beat + sec.beats;
    let b = beat;
    let i = 0;
    if (sec.gap === undefined || sec.gap >= 900) { beat = end; continue; }
    while (b < end - 0.75) {
      const sector = nextSector(sec.pattern ?? 'sweep', prev, i, rng);
      const sequence = sec.gateSequence;
      const kind = sequence?.[i % sequence.length] ?? volume.obstacle;
      out.push({ beat: Math.round(b * 100) / 100, sector, section: sec.name, kind });
      prev = sector;
      b += sec.gap;
      i++;
    }
    beat = end;
  }
  if (difficulty === 'impossible') return impossibleChart(out);
  if (difficulty !== 'easy') return out;
  let last = -99;
  return out.filter(gate => {
    if (gate.beat - last < 2) return false;
    last = gate.beat;
    return true;
  });
}

type ChartProvider = (volume: VolumeDefinition, seed: number, difficulty?: Difficulty) => ChartGate[];
const chartProviders: Record<VolumeId, ChartProvider> = {
  elsewhere: elsewhereChart,
  daybreak: (_volume, _seed, difficulty) => daybreakChart(difficulty),
  descent: (_volume, _seed, difficulty) => descentChart(difficulty),
  orbit: (_volume, _seed, difficulty) => orbitChart(difficulty),
};

/** The default authored chart, deterministic for a given seed. */
export function buildChart(volume: VolumeDefinition, seed = volume.seed) {
  return chartProviders[volume.id](volume, seed);
}

export function chartFor(volume: VolumeDefinition, difficulty: Difficulty, seed = difficultySettings(volume, difficulty).seed) {
  return chartProviders[volume.id](volume, seed, resolveDifficulty(volume.id, difficulty));
}

export function difficultySettings(volume: VolumeDefinition, difficulty: Difficulty) {
  difficulty = resolveDifficulty(volume.id, difficulty);
  if (difficulty === 'impossible') return { lives: IMPOSSIBLE_LIVES, mult: IMPOSSIBLE_SCORE_MULTIPLIER,
    seed: volume.seed + 13, speedFactor: IMPOSSIBLE_SPEED_FACTOR };
  const offsets = { easy: 0, normal: 7, hard: 13 };
  const multipliers = { easy: 1, normal: 1.6, hard: 2.4 };
  return { lives: volume.lives[difficulty], mult: multipliers[difficulty], seed: volume.seed + offsets[difficulty], speedFactor: 1 };
}
