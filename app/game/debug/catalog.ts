import { chartFor } from '../core/chart';
import { daybreakGateKinds, daybreakGates, isDaybreakGate } from '../core/daybreak-gates';
import { descentDirections, isDescentGate } from '../core/descent-gates';
import type { DescentGateKind } from '../core/descent-gates';
import { VOLUMES } from '../core/volumes';
import type { GateKind } from '../core/volumes';

const sceneTimes = { elsewhere: 36, daybreak: 32, descent: 45, orbit: 38 };

export const catalog = VOLUMES.map(volume => {
  const chart = chartFor(volume, 'normal');
  return {
    volume,
    seconds: sceneTimes[volume.id],
    gates: volume.id === 'daybreak' ? daybreakGateKinds : [...new Set(chart.map(gate => gate.kind))],
    gateCount: chart.length,
  };
});

const gateNotes = {
  iris: 'One open wedge around a solid hub.',
  square: 'Fixed square opening at the centre.',
  diamond: 'Fixed diamond opening at the centre.',
  aperture: 'A round opening offset from the centre.',
};

const descentDescriptions = {
  'laser-matrix': { label: 'Matrix 3×3', note: 'Beveled glass panels frame one of eight open outer cells.' },
  'laser-slice': { label: 'Slice Gate', note: 'Glass banks leave a full-width or full-height passage.' },
  'laser-weave': { label: 'Diagonal Weave', note: 'Mirrored glass wedges frame a diagonal passage.' },
};

type DescentExample = { label: string; open: number; axis: 0 | 1 };
export const descentExamples: Record<DescentGateKind, readonly DescentExample[]> = {
  'laser-matrix': descentDirections.map((direction, open) => ({ label: direction, open, axis: 0 })),
  'laser-slice': [
    { label: 'Vertical · left', open: 4, axis: 0 }, { label: 'Vertical · centre', open: 2, axis: 0 },
    { label: 'Vertical · right', open: 0, axis: 0 }, { label: 'Horizontal · top', open: 2, axis: 1 },
    { label: 'Horizontal · middle', open: 0, axis: 1 }, { label: 'Horizontal · bottom', open: 6, axis: 1 },
  ],
  'laser-weave': [
    { label: 'Rising · centre', open: 1, axis: 0 }, { label: 'Rising · upper', open: 4, axis: 0 },
    { label: 'Rising · lower', open: 0, axis: 0 }, { label: 'Falling · centre', open: 3, axis: 1 },
    { label: 'Falling · upper', open: 0, axis: 1 }, { label: 'Falling · lower', open: 4, axis: 1 },
  ],
};

export function gateDescription(kind: GateKind) {
  if (isDescentGate(kind)) return descentDescriptions[kind];
  if (isDaybreakGate(kind)) {
    const { label } = daybreakGates[kind];
    return { label, note: kind === 'daybreak-crystal' ? 'One of eight radial slices opens around a solid octagonal hub.'
      : kind === 'daybreak-vertical' ? 'Fixed tall opening with four clipped corners.' : 'Fixed wide hexagonal opening.' };
  }
  return { label: kind, note: gateNotes[kind] };
}

export const cabinViews = [
  { id: 'daybreak-cabin-ahead', label: 'Ahead · gate and cabin', yaw: 0, pitch: .10 },
  { id: 'daybreak-cabin-side', label: 'Side · waist and glass', yaw: -.83, pitch: .22 },
  { id: 'daybreak-cabin-roof', label: 'Up · transparent roof', yaw: .16, pitch: .93 },
] as const;

export const pickupCards = [
  { kind: 'shield', name: 'Prism Shield', color: '#64d8ff', effect: 'Blocks one hit that would cost a life.' },
  { kind: 'resonance', name: 'Resonance', color: '#ff84e1', effect: '+25% score on the next 8 gates you pass.' },
  { kind: 'lumen', name: 'Lumen', color: '#ffe680', effect: '+2,500 / 5,000 / 7,500 / 10,000 points by difficulty.' },
] as const;
