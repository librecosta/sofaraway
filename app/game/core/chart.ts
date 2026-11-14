/* ------------------------------------------------------------------ *
 *  Chart — the score.
 *
 *  Absolute beats author the spatial rhythm of the track. Directional gates
 *  use the sector to select the missing pane.
 *
 *  Sector index, counter-clockwise from east:
 *      0 E   1 NE   2 N   3 NW   4 W   5 SW   6 S   7 SE
 * ------------------------------------------------------------------ */

import type { Difficulty } from '../contracts';
import type { DaybreakGateKind } from './daybreak-gates';
import { drums } from './daybreak-score';
import { IMPOSSIBLE_LIVES, IMPOSSIBLE_SCORE_MULTIPLIER, IMPOSSIBLE_SPEED_FACTOR, resolveDifficulty } from './difficulty';
import { impossibleChart } from './impossible-chart';
import type { GateKind, VolumeDefinition } from './volumes';

export interface ChartGate {
  beat: number;
  sector: number;
  section: string;
  kind: GateKind;
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

const crystal = 'daybreak-crystal', rotated = 'daybreak-crystal-45';
const vertical = 'daybreak-vertical', horizontal = 'daybreak-horizontal';
const daybreakPhrases: Readonly<Record<string, readonly (readonly [DaybreakGateKind, number])[]>> = {
  GLIDE: [[vertical, 0], [rotated, 0], [crystal, 1], [rotated, 1], [crystal, 2], [horizontal, 0], [crystal, 3], [rotated, 3]],
  LIFT: [[crystal, 0], [vertical, 0], [rotated, 3], [rotated, 0], [horizontal, 0], [crystal, 1],
    [vertical, 0], [rotated, 1], [crystal, 2], [horizontal, 0], [rotated, 2], [crystal, 3]],
  BREEZE: [[horizontal, 0], [rotated, 3], [crystal, 0], [vertical, 0]],
  SUNBURST: [[rotated, 0], [crystal, 1], [rotated, 1], [crystal, 2], [rotated, 2], [crystal, 3],
    [vertical, 0], [rotated, 3], [crystal, 0], [horizontal, 0], [rotated, 0], [crystal, 1]],
  RETURN: [[rotated, 1], [vertical, 0], [crystal, 2], [horizontal, 0], [rotated, 2], [crystal, 3], [rotated, 3], [crystal, 0]],
};

/** The original DAYBREAK pacing grid still drives speed and world stations. */
export function daybreakPacing(volume: VolumeDefinition) {
  const sections: { name: string; beats: number[] }[] = [];
  let start = 0, previous = -Infinity;
  for (const section of volume.sections) {
    const end = start + section.beats;
    const beats: number[] = [];
    if (section.gap < 900) {
      const kicks = drums.slice(start / 4, end / 4).flat().filter(hit => hit.kind === 'kick')
        .map(hit => Math.round(hit.time * volume.bpm / 15) / 4);
      for (let target = start + (section.name === 'BREEZE' ? 4 : 0); target < end - 1; target += section.gap) {
        const anchor = kicks.reduce((best, kick) => Math.abs(kick - target) < Math.abs(best - target) ? kick : best, Infinity);
        previous = Math.max(previous + 2.5, start, Math.abs(anchor - target) <= .5 ? anchor : target);
        beats.push(previous);
      }
    }
    sections.push({ name: section.name, beats });
    start = end;
  }
  return sections;
}

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

/** the authored chart, deterministic for a given seed */
export function buildChart(volume: VolumeDefinition, seed = volume.seed): ChartGate[] {
  const rng = mulberry32(seed);
  const out: ChartGate[] = [];
  let beat = 0;
  let prev = 2;          // start up

  if (volume.music === 'breakbeat') {
    for (const { name, beats } of daybreakPacing(volume)) {
      const phrase = daybreakPhrases[name];
      for (const [i, anchor] of beats.entries()) {
        const [kind, sector] = phrase[i % phrase.length];
        out.push({ beat: anchor, sector, section: name, kind });
        // Echo alternating anchors with the same opening. The added crossing
        // raises cadence without asking for a full lateral move in half a gap.
        if (i % 2 === 0 && i + 1 < beats.length) {
          out.push({ beat: (anchor + beats[i + 1]) / 2, sector, section: name, kind });
        }
      }
    }
    return out;
  }

  for (const sec of volume.sections) {
    const end = beat + sec.beats;
    let b = beat;
    let i = 0;
    if (sec.gap >= 900) { beat = end; continue; }   // gate-free section
    while (b < end - 0.75) {
      const sector = nextSector(sec.pattern, prev, i, rng);
      const sequence = sec.gateSequence;
      const kind = sequence?.[i % sequence.length] ?? volume.obstacle;
      out.push({ beat: Math.round(b * 100) / 100, sector, section: sec.name, kind });
      prev = sector;
      b += sec.gap;
      i++;
    }
    beat = end;
  }
  return out;
}

/** difficulty trims the chart; hard and normal play the authored one */
export function chartFor(volume: VolumeDefinition, difficulty: Difficulty, seed = difficultySettings(volume, difficulty).seed): ChartGate[] {
  const base = buildChart(volume, seed);
  difficulty = resolveDifficulty(volume.id, difficulty);
  if (difficulty === 'impossible') return impossibleChart(base);
  if (difficulty !== 'easy') return base;
  if (volume.music === 'breakbeat') {
    let section = '', index = 0;
    return base.filter(gate => {
      if (section !== gate.section) { section = gate.section; index = 0; }
      return index++ % 3 !== 1;
    });
  }

  const out: ChartGate[] = [];
  let last = -99;
  for (const g of base) {
    if (g.beat - last >= 2) {
      out.push(g);
      last = g.beat;
    }
  }
  return out;
}

export function difficultySettings(volume: VolumeDefinition, difficulty: Difficulty) {
  difficulty = resolveDifficulty(volume.id, difficulty);
  if (difficulty === 'impossible') return { lives: IMPOSSIBLE_LIVES, mult: IMPOSSIBLE_SCORE_MULTIPLIER,
    seed: volume.seed + 13, speedFactor: IMPOSSIBLE_SPEED_FACTOR };
  const offsets = { easy: 0, normal: 7, hard: 13 };
  const multipliers = { easy: 1, normal: 1.6, hard: 2.4 };
  return { lives: volume.lives[difficulty], mult: multipliers[difficulty], seed: volume.seed + offsets[difficulty], speedFactor: 1 };
}
