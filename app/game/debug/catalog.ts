import { chartFor } from '../core/chart';
import { daybreakGateKinds, daybreakGates, isDaybreakGate } from '../core/daybreak-gates';
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
  lattice: 'One missing outer plate. The centre stays solid.',
  aperture: 'A round opening offset from the centre.',
};

export function gateDescription(kind: GateKind) {
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
