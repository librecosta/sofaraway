import type { BaseDifficulty, VolumeId } from '../contracts';
import { bpm as daybreakBpm, sections as daybreakScoreSections } from './daybreak-score';
import { daybreakGateKinds } from './daybreak-gates';
import type { DaybreakGateKind } from './daybreak-gates';
import { controlTrack } from './descent-score';
import type { DescentGateKind } from './descent-gates';

export type GateKind = 'iris' | 'square' | 'diamond' | DaybreakGateKind | DescentGateKind;
export type Topology = 'conduit' | 'canal' | 'facility' | 'orbit';
export type Music = 'techno' | 'breakbeat' | 'control';
export interface Section {
  name: string;
  beats: number;
  gap?: number;
  pattern?: string;
  energy: number;
  gateSequence?: readonly GateKind[];
}
export interface VolumeDefinition {
  id: Exclude<VolumeId, 'orbit'>;
  name: string;
  subtitle: string;
  bpm: number;
  sections: readonly Section[];
  beats: number;
  seed: number;
  topology: Topology;
  obstacle: Exclude<GateKind, 'square' | 'diamond'>;
  music: Music;
  soundtrack?: { readonly title: string; readonly tail: number };
  hue: readonly number[];
  lives: Readonly<Record<BaseDifficulty, number>>;
}

/* ------------------------------------------------------------------ *
 *  Volumes — one record per map.
 *
 *  Everything a run needs hangs off these: tempo, length, the section
 *  table that both the chart and the arrangement read, the corridor
 *  topology, the kind of glass you are threading, and the palette.
 * ------------------------------------------------------------------ */

/* section = { name, beats, gap, pattern, energy } */

const SECTIONS_I: readonly Section[] = [
  { name: 'INTRO',  beats: 16, gap: 999,  pattern: 'sweep',    energy: 0.15 },
  { name: 'A',      beats: 80, gap: 4.0,  pattern: 'step',     energy: 0.45 },
  { name: 'B',      beats: 64, gap: 4.0,  pattern: 'opposite', energy: 0.55,
    gateSequence: ['iris', 'iris', 'iris', 'square'] },
  { name: 'BUILD',  beats: 32, gap: 3.0,  pattern: 'zigzag',   energy: 0.75,
    gateSequence: ['iris', 'iris', 'iris', 'diamond'] },
  { name: 'DROP',   beats: 96, gap: 2.33, pattern: 'leap',     energy: 1.00,
    gateSequence: ['iris', 'iris', 'square', 'iris', 'diamond'] },
  { name: 'BREAK',  beats: 32, gap: 5.33, pattern: 'sweep',    energy: 0.30,
    gateSequence: ['iris', 'square', 'iris', 'diamond', 'iris', 'square'] },
  { name: 'A2',     beats: 64, gap: 3.0,  pattern: 'step',     energy: 0.65,
    gateSequence: ['iris', 'iris', 'square', 'iris', 'diamond'] },
  { name: 'FINALE', beats: 64, gap: 2.33, pattern: 'leap',     energy: 1.00,
    gateSequence: ['iris', 'square', 'iris', 'diamond', 'iris'] },
];

const daybreakPacing = {
  OPEN: { gap: 999, energy: .12 },
  GLIDE: { gap: 4, energy: .52 },
  LIFT: { gap: 4, energy: .72 },
  BREEZE: { gap: 8, energy: .27 },
  SUNBURST: { gap: 3, energy: 1 },
  RETURN: { gap: 4, energy: .61 },
  OUTRO: { gap: 999, energy: .22 },
} as const;
const SECTIONS_II: readonly Section[] = daybreakScoreSections.map(({ name, startBeat, endBeat }) =>
  ({ name, beats: endBeat - startBeat, pattern: 'step', ...daybreakPacing[name] }));

const descentEnergy = {
  ORDER: .15, LOCK: .55, FLIGHT: .65, PRESSURE: .85, HOLD: .35, LOCKDOWN: 1, BREACH: .75,
} as const;
const SECTIONS_III: readonly Section[] = controlTrack.sections.map(({ name, startBeat, endBeat }) =>
  ({ name, beats: endBeat - startBeat, energy: descentEnergy[name] }));

function total(sections: readonly Section[]) {
  return sections.reduce((n, s) => n + s.beats, 0);
}

export const VOLUMES: readonly VolumeDefinition[] = [
  {
    id: 'elsewhere',
    name: 'ELSEWHERE',
    subtitle: 'VOL. I',
    bpm: 128,
    sections: SECTIONS_I,
    beats: total(SECTIONS_I),
    seed: 20131,
    topology: 'conduit',
    obstacle: 'iris',
    music: 'techno',
    hue: [0.44, 0.78, 0.92, 0.57, 0.09, 0.66],
    lives: { easy: 3, normal: 2, hard: 1 },
  },
  {
    id: 'daybreak',
    name: 'DAYBREAK',
    subtitle: 'VOL. II',
    bpm: daybreakBpm,
    sections: SECTIONS_II,
    beats: total(SECTIONS_II),
    seed: 88121,
    topology: 'canal',          // enclosed observation cabin
    obstacle: daybreakGateKinds[0],
    music: 'breakbeat',
    hue: [0.52, 0.60, 0.47, 0.68],
    lives: { easy: 3, normal: 2, hard: 1 },
  },
  {
    id: 'descent',
    name: 'DESCENT',
    subtitle: 'VOL. III',
    bpm: controlTrack.bpm,
    sections: SECTIONS_III,
    beats: controlTrack.beats,
    seed: 44129,
    topology: 'facility',
    obstacle: 'laser-matrix',
    music: controlTrack.id,
    soundtrack: controlTrack,
    hue: [0.03, 0.98, 0.09],
    lives: { easy: 3, normal: 2, hard: 1 },
  },
];

export function volumeById(id: string | null): VolumeDefinition {
  if (id === 'orbit') throw new Error('ORBIT is available as a development flight preview.');
  return VOLUMES.find((v) => v.id === (id === 'drift' ? 'daybreak' : id)) || VOLUMES[0];
}

export function hasAuthoredAudio(volume: VolumeDefinition) {
  return volume.music === 'breakbeat' || volume.music === 'control';
}

export function sectionAt(volume: VolumeDefinition, beat: number) {
  let start = 0;
  for (const [i, section] of volume.sections.entries()) {
    const end = start + section.beats;
    if (beat < end) return { ...section, i, start, end, next: volume.sections[i + 1] };
    start = end;
  }
  return null;
}
