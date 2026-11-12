import type { PlayMode } from '../contracts';
import type { Path } from '../graphics/path';
import { BRANCH_PREVIEW_BEAT, REJOIN_BEAT, SPLIT_BEAT } from './branches';
import { chartFor } from './chart';
import { SECTION } from './collision';
import type { Placement, StructureKind } from './dressing';
import { lightCues } from './lighting-score';
import { PICKUP_BEAT } from './pickups';
import { BOOST_MULTIPLIER, cruiseTarget, modeScale, referenceFor, START_DISTANCE } from './reference-track';
import { sightseeingChart } from './sightseeing';
import type { VolumeDefinition } from './volumes';

export const ARCH_RING = 3;
export const ARCH_ORIGIN = START_DISTANCE;
export const ARCH_MODULE = 12 * ARCH_RING;
export const WALL_RECESS = .34;
export const WALL_MOUNT = .29;
export const WALL_INSET = [.065, .105, .895, .935] as const;
export const SLOT_X = 1.16;
export const SLOT_SPACING = 4 * ARCH_RING;
export const SLOT_LENGTH = 2 * ARCH_RING;

export type LightingZoneKind = 'structural-only' | 'continuous-edge' | 'ceiling-pair' | 'ordered-rhythm';
export interface LightingZone {
  readonly id: number;
  readonly chapter: string;
  readonly kind: LightingZoneKind;
  readonly startStation: number;
  readonly endStation: number;
  readonly spacing: number;
  readonly groups: readonly (0 | 1)[];
}

export interface ScenicLamp {
  readonly zone: number;
  readonly group: 0 | 1;
  readonly side: 0 | 1;
  readonly station: number;
  readonly ordered: boolean;
}

export interface ScenicPlan {
  readonly mode: PlayMode;
  readonly placements: readonly Placement[];
  readonly lamps: readonly ScenicLamp[];
  readonly zones: readonly LightingZone[];
}
const a = SECTION.a, b = SECTION.b;
export const socketHalf = (kind: StructureKind) => kind === 'utility-conduits' ? 2 * ARCH_RING : ARCH_RING;
const atGrid = (station: number, unit = ARCH_RING) => ARCH_ORIGIN + Math.ceil((station - ARCH_ORIGIN) / unit) * unit;

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

/** Plans vary by mode, but every module and fixture uses the same global grid and actual size. */
export function makeScenicPlan(volume: VolumeDefinition, path: Path, mode: PlayMode = 'standard'): ScenicPlan {
  if (volume.id !== 'elsewhere') return { mode, placements: [], lamps: [], zones: [] };
  const { pickups, junctions } = dressingClearances(volume, mode);
  const reference = referenceFor(volume);
  const placements: Placement[] = [], lamps: ScenicLamp[] = [], zones: LightingZone[] = [];
  const straight = path.segments.filter(s => s.type === 'straight');
  const avoidJunction = (lo: number, hi: number) => junctions.every(([a, b]) => hi <= a || lo >= b);
  const clear = (lo: number, hi: number) => avoidJunction(lo, hi) && pickups.every(p => hi < p - 18 || lo > p + 18);
  const first = ARCH_ORIGIN - ARCH_MODULE;
  const through = atGrid(START_DISTANCE + modeScale(mode) * (volume.beats * 60 / volume.bpm * 34 * BOOST_MULTIPLIER + 100), ARCH_MODULE);
  const starts = lightCues.map((cue, i) => i === 0 ? first : atGrid(reference.station(cue.start, mode)));
  const addZone = (chapter: string, kind: LightingZoneKind, startStation: number, endStation: number) => {
    if (endStation <= startStation) return;
    const active = kind === 'ceiling-pair' || kind === 'ordered-rhythm';
    const zone: LightingZone = { id: zones.length, chapter, kind, startStation, endStation,
      spacing: active ? SLOT_SPACING : ARCH_RING, groups: kind === 'ordered-rhythm' ? [0, 1] : active ? [0] : [] };
    zones.push(zone);
    if (!active) return;
    for (let s = startStation + SLOT_LENGTH / 2; s + SLOT_LENGTH / 2 <= endStation; s += SLOT_SPACING) {
      for (const side of [0, 1] as const) {
        lamps.push({ station: s, side, group: kind === 'ordered-rhythm' ? side : 0, zone: zone.id, ordered: kind === 'ordered-rhythm' });
      }
    }
  };
  for (const [i, cue] of lightCues.entries()) {
    const lo = starts[i], hi = starts[i + 1] ?? through;
    const quiet = cue.name === 'INTRO' || cue.name === 'BREAK';
    const normal = quiet ? 'structural-only' : 'continuous-edge';
    // Author one continuous installation in A and one in BUILD. Do not start/stop lights on each bend.
    const length = (cue.name === 'A' ? 5 : 4) * SLOT_SPACING;
    let feature: number | undefined;
    if (cue.name === 'A' || cue.name === 'BUILD') {
      const target = reference.station(cue.start + (cue.name === 'A' ? 24 : 12), mode);
      for (const segment of straight) {
        const start = atGrid(Math.max(segment.s0 + 6, lo + ARCH_RING));
        const end = atGrid(Math.min(segment.s1 - 6, hi - ARCH_RING) - length) - ARCH_RING;
        if (end < start) continue;
        const fit = Math.min(end, Math.max(start, atGrid(target - length * .5)));
        if (clear(fit, fit + length) && (feature === undefined || Math.abs(fit + length * .5 - target) <
          Math.abs(feature + length * .5 - target))) feature = fit;
      }
    }
    if (feature === undefined) addZone(cue.name, normal, lo, hi);
    else {
      addZone(cue.name, normal, lo, feature);
      addZone(cue.name, cue.name === 'A' ? 'ceiling-pair' : 'ordered-rhythm', feature, feature + length);
      addZone(cue.name, normal, feature + length, hi);
    }

    const wall: StructureKind | undefined = cue.name === 'A' || cue.name === 'A2' ? 'utility-conduits'
      : cue.name === 'B' || cue.name === 'DROP' ? 'ventilation-assembly' : cue.name === 'BUILD' ? 'service-bay'
        : cue.name === 'FINALE' ? 'holographic-service-door' : undefined;
    for (let s = atGrid(lo, ARCH_MODULE); s < hi; s += ARCH_MODULE) {
      if (s >= lo + 1 && path.straightBetween(s - 3, s + 3) && clear(s - 3, s + 3)) {
        placements.push({ id: placements.length + 1, station: s, mount: 'ceiling', x: 0, y: b, kind: 'overhead-assembly' });
      }
      // Every other full module stays as unbroken wall; the remaining bays are mirrored.
      if (!wall || ((s - ARCH_ORIGIN) / ARCH_MODULE) % 2 !== 0) continue;
      const at = s + ARCH_MODULE / 2, half = socketHalf(wall);
      if (at - half < lo || at + half >= hi || !clear(at - half, at + half)
        || !path.straightBetween(at - half - ARCH_RING, at + half + ARCH_RING)) continue;
      for (const sign of [-1, 1]) {
        placements.push({ id: placements.length + 1, kind: wall, station: at,
          mount: sign < 0 ? 'left' : 'right', x: sign * (a + WALL_MOUNT), y: 0 });
      }
    }
  }
  return { mode, placements: placements.sort((a, b) => a.station - b.station), lamps, zones };
}

export function zoneAt(plan: ScenicPlan, station: number) {
  return plan.zones.find(zone => zone.startStation <= station && station < zone.endStation);
}
