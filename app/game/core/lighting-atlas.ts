import type { PlayMode } from '../contracts';
import { SECTION } from './collision';
import { lightingWindows } from './corridor-composition';
import type { AfterglowStage, OutroPlan } from './encore';
import { ease } from './lighting-score';
import { referenceFor } from './reference-track';
import type { VolumeDefinition } from './volumes';

export type CorridorLightingKind = typeof lightingWindows[number][0];
export const corridorLabels: Record<CorridorLightingKind, string> = {
  'pure-frame': 'Pure Frame', 'helical-wash': 'Helical Wash', 'staggered-cells': 'Staggered Cells',
  'triple-helix': 'Triple Helix', 'connected-flow': 'Connected Flow', 'raked-bands': 'Raked Bands',
};

const { a, b, ch } = SECTION;
export const octagon = [
  [-a + ch, -b], [a - ch, -b], [a, -b + ch], [a, b - ch],
  [a - ch, b], [-a + ch, b], [-a, b - ch], [-a, -b + ch],
] as const;
const edges = octagon.map(([x, y], i) => {
  const [ex, ey] = octagon[(i + 1) % octagon.length];
  const length = Math.hypot(ex - x, ey - y);
  return { x, y, tx: (ex - x) / length, ty: (ey - y) / length, length };
});
export const perimeter = edges.reduce((sums, edge) => [...sums, sums.at(-1)! + edge.length], [0]);
export const circumference = perimeter.at(-1)!;
const panelInset = .966; // Just inside the recessed panel skin at .970 of the nominal profile.
export const washFaceProjection = edges.map(({ x, y, tx, ty }, i) =>
  [tx / panelInset, ty / panelInset, perimeter[i] - x * tx - y * ty] as const);
const wrap = (l: number) => {
  const u = l - Math.floor(l / circumference) * circumference;
  return u < circumference ? u : 0;
};
const edgeAt = (l: number) => edges.findIndex((_, i) => l < perimeter[i + 1]);

function onFace(edge: number, l: number) {
  const { x, y, tx, ty } = edges[edge];
  const local = l - perimeter[edge];
  return { x: (x + tx * local) * panelInset, y: (y + ty * local) * panelInset,
    tx, ty, nx: -ty, ny: tx, edge };
}

type WallPoint = ReturnType<typeof onFace>;
type WallSpan = readonly [WallPoint, WallPoint];

/** Split a short circumferential lamp on actual face boundaries, including the wrap seam. */
export function wallSpans(center: number, width: number): WallSpan[] {
  let lo = wrap(center - width / 2), remaining = width;
  const spans: WallSpan[] = [];
  while (remaining > 1e-8) {
    const edge = edgeAt(lo);
    const hi = Math.min(lo + remaining, perimeter[edge + 1]);
    spans.push([onFace(edge, lo), onFace(edge, hi)]);
    remaining -= hi - lo;
    lo = hi < circumference ? hi : 0;
  }
  return spans;
}

export interface CorridorLight {
  readonly start: number;
  readonly end: number;
  readonly level: number;
  readonly group: 0 | 1;
  readonly style: 'flow' | 'lens' | 'wash' | 'rake';
  readonly entry: WallSpan;
  readonly exit: WallSpan;
}

export interface LightingZone {
  readonly kind: CorridorLightingKind;
  readonly start: number;
  readonly end: number;
  readonly margin: number;
  readonly dual: boolean;
  readonly lights: readonly CorridorLight[];
  readonly afterglow?: AfterglowStage;
}

export const FLOW_WAVELENGTH = 60;
export const helixPitch = (mode: PlayMode) => mode === 'standard' ? 108 : 72;
export const washPitch = (mode: PlayMode) => mode === 'standard' ? 144 : 108;
export const washWidth = 1.42;
export const washStart = (perimeter[7] + perimeter[8]) / 2;
export const washStrands = 3;
export const washSpacing = circumference / washStrands;
export const washCenter = (distance: number, pitch: number, strand: number) =>
  washStart + circumference * distance / pitch + strand * washSpacing;
export const zoneFade = (s: number, start: number, end: number, margin: number) =>
  ease((s - start) / margin) * ease((end - s) / margin);

function makeZone(kind: CorridorLightingKind, start: number, end: number, mode: PlayMode): LightingZone {
  const margin = Math.min(mode === 'standard' ? 21 : 14, (end - start) / 5);
  const lights: CorridorLight[] = [];
  const fade = (s: number) => zoneFade(s, start, end, margin);
  const right = (y: number) => perimeter[2] + y + b - ch;
  const left = (y: number) => perimeter[6] + b - ch - y;
  const strip = (lo: number, hi: number, l0: number, l1: number, width: number, level: number,
    style: CorridorLight['style'], group: 0 | 1 = 0) => {
    lights.push({ start: lo, end: hi, entry: wallSpans(l0, width)[0], exit: wallSpans(l1, width)[0],
      level: level * fade((lo + hi) / 2), group, style });
  };
  const cells = (s: number, center: number, width: number, length: number, level: number, group: 0 | 1 = 0) => {
    for (const span of wallSpans(center, width)) {
      lights.push({ start: s - length / 2, end: s + length / 2, entry: span, exit: span,
        level: level * fade(s), group, style: 'lens' });
    }
  };
  switch (kind) {
    case 'helical-wash': {
      const pitch = washPitch(mode);
      for (let s = start; s < end; s += 18) {
        const next = Math.min(end, s + 18);
        const footprint = washWidth + circumference * (next - s) / pitch + .002;
        for (let strand = 0; strand < washStrands; strand++) {
          const center = washCenter((s + next) / 2 - start, pitch, strand);
          for (const span of wallSpans(center, footprint)) {
            lights.push({ start: s, end: next, entry: span, exit: span, level: .63, group: 0, style: 'wash' });
          }
        }
      }
      break;
    }
    case 'staggered-cells':
      for (let i = 0, s = start + 5.25; s + 2.4 < end; i++, s += 10.5) {
        const y = (i % 2 ? -1 : 1) * (i % 4 < 2 ? 1.05 : .68);
        cells(s, left(y), .19, 1.7, .85, 0);
        cells(s, right(-y), .19, 1.7, .85, 1);
      }
      break;
    case 'triple-helix':
      for (let s = start + 4.5; s + .15 < end; s += 9) {
        for (let strand = 0; strand < 3; strand++) {
          const center = circumference * ((s - start) / helixPitch(mode) + strand / 3);
          cells(s, center, .91, .098, .96);
        }
      }
      break;
    case 'connected-flow': {
      const wave = (s: number) => .78 + .27 * Math.sin(2 * Math.PI * (s - start) / FLOW_WAVELENGTH);
      for (let s = start; s < end; s += 3) {
        const next = Math.min(end, s + 3), y0 = wave(s), y1 = wave(next);
        strip(s, next, left(y0), left(y1), .077, .71, 'flow', 0);
        strip(s, next, right(y0), right(y1), .077, .71, 'flow', 1);
      }
      break;
    }
    case 'raked-bands': {
      const rakes = [[.765, .495, 5.5], [-.8675, -.3425, 4.5], [.77, .07, 4.5], [-.79, .31, 4]] as const;
      for (let s = start + 2.5, i = 0; s + 5.5 <= end; s += 10, i++) {
        const [from, to, length] = rakes[i % rakes.length];
        for (const side of [left, right]) {
          strip(s, s + length, side(from), side(to), .39, .90, 'rake');
        }
      }
      break;
    }
  }
  return { kind, start, end, margin, dual: kind === 'staggered-cells' || kind === 'connected-flow', lights };
}

export function makeLightingAtlas(volume: VolumeDefinition, mode: PlayMode): readonly LightingZone[] {
  if (volume.id !== 'elsewhere') return [];
  const reference = referenceFor(volume);
  return lightingWindows.map(([kind, lo, hi]) => makeZone(kind, reference.station(lo, mode), reference.station(hi, mode), mode));
}

export function makeAfterglowAtlas(plan: OutroPlan): readonly LightingZone[] {
  return plan.afterglow.map(({ stage, start, end }) => {
    const kind = stage === 'flow' ? 'connected-flow' : stage === 'luminous' ? 'triple-helix' : 'pure-frame';
    return { ...makeZone(kind, start, end, plan.mode), dual: false, afterglow: stage };
  });
}

export function corridorAt(atlas: readonly LightingZone[], station: number) {
  return atlas.find(zone => zone.start <= station && station < zone.end);
}

/** Reduce competing structural light inside an installation while keeping its silhouette. */
export function frameLightLevel(atlas: readonly LightingZone[], station: number) {
  const zone = corridorAt(atlas, station);
  if (!zone || (zone.kind === 'pure-frame' && !zone.afterglow)) return 1;
  const attenuation = zone.afterglow === 'release' ? .40 : zone.afterglow === 'closing' ? .21 : zone.kind === 'helical-wash' ? .24 : .34;
  return 1 - attenuation * zoneFade(station, zone.start, zone.end, zone.margin);
}
