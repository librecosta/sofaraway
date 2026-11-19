import { SECTION } from './section';

export const orbitGateKinds = ['orbit-single', 'orbit-dual', 'orbit-triple'] as const;
export type OrbitGateKind = typeof orbitGateKinds[number];
export type ApertureShape = 'circle' | 'square' | 'diamond';
export type ApertureSize = 'L' | 'M' | 'S';
export type ApertureAnchor = 'TL' | 'T' | 'TR' | 'L' | 'C' | 'R' | 'BL' | 'B' | 'BR';
export interface Aperture { readonly shape: ApertureShape; readonly anchor: ApertureAnchor; readonly size: ApertureSize }
const x = SECTION.a * .5, y = SECTION.b * .53;
export const apertureAnchors: Readonly<Record<ApertureAnchor, readonly [number, number]>> = {
  TL: [-x, y], T: [0, y], TR: [x, y], L: [-x, 0], C: [0, 0], R: [x, 0], BL: [-x, -y], B: [0, -y], BR: [x, -y],
};
// Radius, half-side, and Manhattan extent respectively; these are finite presets,
// independent of difficulty. The narrowest throat is also the CPU boundary.
export const apertureSizes = { circle: { L: 1.12, M: .88, S: .65 },
  square: { L: 1.03, M: .80, S: .58 }, diamond: { L: 1.45, M: 1.13, S: .84 } } as const;
const hole = (shape: ApertureShape, anchor: ApertureAnchor, size: ApertureSize): Aperture => ({ shape, anchor, size });
const c = (anchor: ApertureAnchor, size: ApertureSize = 'L') => hole('circle', anchor, size);
const s = (anchor: ApertureAnchor, size: ApertureSize = 'M') => hole('square', anchor, size);
const d = (anchor: ApertureAnchor, size: ApertureSize = 'M') => hole('diamond', anchor, size);
export const orbitPresets: Readonly<Record<OrbitGateKind, readonly { readonly label: string; readonly holes: readonly Aperture[]; readonly preferred: number }[]>> = {
  'orbit-single': [c('C'), c('L'), c('R'), c('T'), c('B'), c('TL', 'M'), c('BR', 'M'),
    s('C', 'L'), s('TR'), s('BL'), d('C', 'L'), d('T')].map(aperture =>
    ({ label: `${aperture.shape} · ${aperture.anchor} · ${aperture.size}`, holes: [aperture], preferred: 0 })),
  'orbit-dual': [[c('L', 'M'), c('R', 'M')], [s('T'), s('B')], [d('TL'), d('BR')],
    [c('C', 'S'), c('R', 'S')], [s('C', 'S'), s('L', 'S')], [d('TR'), d('BL')]].map((holes, i) =>
    ({ label: `${i + 1} · ${holes.map(h => `${h.shape} ${h.anchor} ${h.size}`).join(' / ')}`, holes, preferred: 0 })),
  'orbit-triple': [[c('L', 'S'), c('C', 'S'), c('R', 'S')], [s('T', 'S'), s('C', 'S'), s('B', 'S')],
    [d('TL', 'S'), d('C', 'S'), d('BR', 'S')], [c('TR', 'S'), c('C', 'S'), c('BL', 'S')],
    [s('TL', 'S'), c('R', 'S'), d('B', 'S')], [d('TR', 'S'), s('L', 'S'), c('B', 'S')]].map((holes, i) =>
    ({ label: `${i + 1} · ${holes.map(h => `${h.shape} ${h.anchor} ${h.size}`).join(' / ')}`, holes, preferred: i < 4 ? 1 : 0 })),
};
export function isOrbitGate(kind: string): kind is OrbitGateKind { return (orbitGateKinds as readonly string[]).includes(kind); }
export function orbitPreset(kind: OrbitGateKind, index: number) {
  const presets = orbitPresets[kind];
  return presets[((index % presets.length) + presets.length) % presets.length];
}
export function apertureClearance(hole: Aperture, px: number, py: number) {
  const [cx, cy] = apertureAnchors[hole.anchor], radius = apertureSizes[hole.shape][hole.size];
  const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
  return hole.shape === 'circle' ? radius - Math.hypot(dx, dy)
    : hole.shape === 'square' ? radius - Math.max(dx, dy) : (radius - dx - dy) / Math.SQRT2;
}
export function orbitClearanceAt(kind: OrbitGateKind, index: number, x: number, y: number) {
  return Math.max(...orbitPreset(kind, index).holes.map(hole => apertureClearance(hole, x, y)));
}
export function orbitTarget(kind: OrbitGateKind, index: number, alternate = false): [number, number] {
  const preset = orbitPreset(kind, index);
  return [...apertureAnchors[preset.holes[alternate ? preset.holes.length - 1 : preset.preferred].anchor]];
}
/** Clockwise hole boundary; the face bevel opens outward while the throat stays exact. */
export function apertureContour(hole: Aperture, inset = 0): [number, number][] {
  const [cx, cy] = apertureAnchors[hole.anchor];
  const r = apertureSizes[hole.shape][hole.size] + inset * (hole.shape === 'diamond' ? Math.SQRT2 : 1);
  const points = hole.shape === 'circle' ? Array.from({ length: 64 }, (_, i) => {
    const angle = -i * Math.PI * 2 / 64;
    // Circumscribe the analytic circle: polygon facets never obstruct a legal ray.
    const radius = r / Math.cos(Math.PI / 64);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  }) : hole.shape === 'square' ? [[r, r], [r, -r], [-r, -r], [-r, r]] : [[0, r], [r, 0], [0, -r], [-r, 0]];
  return points.map(([x, y]) => [x + cx, y + cy]);
}
