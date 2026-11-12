import type { PlayMode } from '../contracts';
import type { Path } from '../graphics/path';
import { BRANCH_PREVIEW_BEAT, REJOIN_BEAT, SPLIT_BEAT } from './branches';
import { chartFor } from './chart';
import { SECTION } from './collision';
import { scenicWord } from './dressing';
import type { Mount, Placement, StructureKind } from './dressing';
import { lightCues } from './lighting-score';
import type { LightFamily } from './lighting-score';
import { PICKUP_BEAT } from './pickups';
import { BOOST_MULTIPLIER, cruiseTarget, modeScale, referenceFor, START_DISTANCE } from './reference-track';
import { sightseeingChart } from './sightseeing';
import type { VolumeDefinition } from './volumes';

export interface ScenicLamp {
  readonly id: number; readonly group: number; readonly family: LightFamily; readonly station: number;
  readonly x: number; readonly y: number; readonly width: number; readonly length: number; readonly angle: number;
  readonly wall?: boolean;
}
export interface ScenicPlan {
  readonly mode: PlayMode;
  readonly placements: readonly Placement[];
  readonly lamps: readonly ScenicLamp[];
}
const a = SECTION.a, b = SECTION.b;
const span = { 'overhead-assembly': 1, 'ventilation-assembly': 1.6, 'utility-conduits': 4.3,
  'service-bay': 1.4, 'holographic-service-door': 1.1 };

export function dressingClearances(volume: VolumeDefinition, mode: PlayMode = 'standard') {
  const reference = referenceFor(volume);
  const common = (difficulty: 'easy' | 'normal' | 'hard') =>
    chartFor(volume, difficulty).filter(gate => gate.beat < SPLIT_BEAT || gate.beat >= REJOIN_BEAT);
  const beats = mode === 'sightseeing' ? sightseeingChart(common('normal'), volume.sections).map(g => g.beat)
    : [...new Set((['easy', 'normal', 'hard'] as const).flatMap(d => common(d).map(g => g.beat)))];
  return {
    gates: beats.map(beat => reference.station(beat, mode)),
    pickups: [reference.station(PICKUP_BEAT, mode)],
    junctions: [[
      Math.min(reference.station(BRANCH_PREVIEW_BEAT, mode),
        reference.station(SPLIT_BEAT, mode) - cruiseTarget(Infinity) * BOOST_MULTIPLIER * modeScale(mode) * 1.8) - 25,
      reference.station(REJOIN_BEAT, mode) + 28,
    ] as const],
  };
}

type Motif = 'quiet' | 'overhead' | 'ventilation' | 'maintenance' | 'conduits' | 'portal';
const motifs: readonly (readonly Motif[])[] = [
  ['overhead', 'quiet', 'portal'], ['overhead', 'ventilation', 'quiet', 'maintenance'],
  ['maintenance', 'conduits', 'overhead', 'ventilation'], ['portal', 'overhead', 'conduits'],
  ['conduits', 'ventilation', 'portal', 'overhead'], ['quiet', 'maintenance', 'quiet', 'conduits'],
  ['overhead', 'maintenance', 'conduits', 'quiet'], ['portal', 'overhead', 'ventilation'],
];
const modules: Record<Motif, readonly (readonly [StructureKind, number, number])[]> = {
  quiet: [], overhead: [['overhead-assembly', -6, 0], ['overhead-assembly', 6, 0], ['service-bay', 2, 1]],
  ventilation: [['ventilation-assembly', -5, 1], ['utility-conduits', 3, 1], ['overhead-assembly', 8, 0]],
  maintenance: [['service-bay', -6, 1], ['holographic-service-door', 5, 1], ['overhead-assembly', 0, 0]],
  conduits: [['utility-conduits', -6, 1], ['utility-conduits', 6, 1], ['ventilation-assembly', 8, -1]],
  portal: [['overhead-assembly', -8, 0], ['overhead-assembly', 2, 0], ['overhead-assembly', 12, 0], ['service-bay', 5, -1]],
};

export function makeScenicPlan(volume: VolumeDefinition, path: Path, mode: PlayMode = 'standard'): ScenicPlan {
  if (volume.id !== 'elsewhere') return { mode, placements: [], lamps: [] };
  const { gates, pickups, junctions } = dressingClearances(volume, mode);
  const reference = referenceFor(volume);
  const placements: Placement[] = [], lamps: ScenicLamp[] = [];
  const avoidJunction = (s: number, half: number) => junctions.every(([lo, hi]) => s + half < lo || s - half > hi);
  const clear = (s: number, half: number) => avoidJunction(s, half) && pickups.every(p => Math.abs(s - p) > 23 + half);
  const sectionStops = lightCues.map(c => reference.station(c.start, mode));
  const through = START_DISTANCE + modeScale(mode) * (volume.beats * 60 / volume.bpm * 34 * BOOST_MULTIPLIER + 100);
  let nextId = 1, nextGroup = 0;
  const lamp = (group: number, family: LightFamily, station: number, x: number, y: number,
    width: number, length: number, angle = 0, wall = false) =>
    lamps.push({ id: lamps.length + 1, group, family, station, x, y, width, length, angle, wall });

  for (const [index, segment] of path.segments.entries()) {
    if (segment.s1 < START_DISTANCE - 26 || segment.s0 > through) continue;
    const lo = Math.max(segment.s0 + 5, START_DISTANCE - 24);
    const hi = Math.min(segment.s1 - 7, through);
    if (segment.type !== 'straight') {
      for (let s = lo; s < hi; s += 12) if (avoidJunction(s, 3)) {
        const group = nextGroup++;
        lamp(group, 'fill', s, -.8, b - .055, .19, 2.35);
        lamp(group + 1, 'structural', s + 1.6, 2.08, -b + .04, .11, 1.55);
      }
      continue;
    }
    const seed = scenicWord(index);
    let cell = 0;
    let lastSymbol = -Infinity;
    for (let s = lo + 11; s < hi - 5; s += 36 + (seed % 3) * 3, cell++) {
      if (!avoidJunction(s, 16)) continue;
      let section = sectionStops.length - 1;
      while (section > 0 && sectionStops[section] > s) section--;
      const sequence = motifs[section];
      const motif = sequence[(cell + (seed % 7)) % sequence.length];
      const direction = (cell + seed) % 2 ? 1 : -1;
      const group = nextGroup++ * 2;
      const first = lamps.length;
      lamp(group, 'fill', s, -1.28, b - .10, .38, 5.8);
      lamp(group + 1, 'fill', s, 1.28, b - .10, .38, 5.8);
      for (const sign of [-1, 1]) {
        lamp(group + (sign > 0 ? 1 : 0), 'structural', s + 3, sign * 2.09, -b + .055, .13, 3.2);
      }
      if (motif !== 'quiet') for (const [kind, offset, side] of modules[motif]) {
        const station = s + offset;
        const half = span[kind];
        if (station < lo + half || station > hi - half || !clear(station, half)
          || gates.some(g => Math.abs(g - station) < half + 1.5)) continue;
        const sign = side * direction;
        const mount: Mount = side === 0 ? 'ceiling' : sign < 0 ? 'left' : 'right';
        placements.push({ id: nextId++, kind, mount, station, x: sign * a,
          y: side === 0 ? b : kind === 'utility-conduits' ? .68 : 0 });
        if (side) lamp(group + (sign > 0 ? 0 : 1), 'functional', station + 1.28, sign * (a - .105),
          kind === 'holographic-service-door' ? 1.34 : 1.13, .11, .75, 0, true);
        else for (const x of [-1.25, 1.25]) lamp(group + (x > 0 ? 1 : 0), 'rhythm', station,
          x, b - .45, .43, .11);
      }
      if (motif === 'portal' && s - lastSymbol > 60 && s + 12 < hi && clear(s + 7, 4)) {
        lastSymbol = s;
        for (let k = 0; k < 3; k++) for (const sign of [-1, 1]) {
          lamp(group + (sign > 0 ? 0 : 1), 'hero', s + 5 + k * 1.15, sign * .48, b - .085,
            .11, 1.2, sign * .68);
        }
      }
      if (motif !== 'quiet' && lamps.length === first + 4) {
        lamp(group, 'rhythm', s + 9, -.55, b - .09, .13, 2.0);
        lamp(group + 1, 'rhythm', s + 12, .55, b - .09, .13, 2.0);
      }
    }
  }
  let lastGateMarker = -Infinity;
  for (const station of gates.slice().sort((a, b) => a - b)) {
    if (station - lastGateMarker < 19 || !avoidJunction(station, 4)) continue;
    lastGateMarker = station;
    const group = nextGroup++ * 2;
    for (const sign of [-1, 1]) lamp(group + (sign > 0 ? 1 : 0), 'gate-adjacent', station - 2.8,
      sign * 2.18, -b + .035, .095, .76);
  }
  return { mode, placements: placements.sort((a, b) => a.station - b.station),
    lamps: lamps.sort((a, b) => a.station - b.station) };
}
