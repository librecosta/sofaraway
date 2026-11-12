import { chartFor } from '../core/chart';
import { VOLUMES } from '../core/volumes';
import type { GateKind } from '../core/volumes';
import type { StructureKind } from '../core/dressing';

const sceneTimes = { elsewhere: 36, drift: 32, descent: 45, orbit: 38 };

export const catalog = VOLUMES.map(volume => {
  const chart = chartFor(volume, 'normal');
  return {
    volume,
    seconds: sceneTimes[volume.id],
    gates: [...new Set(chart.map(gate => gate.kind))],
    gateCount: chart.length,
  };
});

export const gateNotes: Record<GateKind, string> = {
  iris: 'One open wedge around a solid hub.',
  square: 'Fixed square opening at the centre.',
  diamond: 'Fixed diamond opening at the centre.',
  shutter: 'One open band. The slats can run across or down.',
  lattice: 'One missing outer plate. The centre stays solid.',
  aperture: 'A round opening offset from the centre.',
};

export const pickupCards = [
  { kind: 'shield', name: 'Prism Shield', color: '#64d8ff', effect: 'Blocks one hit that would cost a life.' },
  { kind: 'resonance', name: 'Resonance', color: '#ff84e1', effect: '+25% score on the next 8 gates you pass.' },
  { kind: 'lumen', name: 'Lumen', color: '#ffe680', effect: '+2,500 / 5,000 / 7,500 points by difficulty.' },
] as const;

export const environmentCards = [
  { id: 'sky', name: 'Canal sky', detail: 'Sky gradient · Drift' },
  { id: 'stars', name: 'Starfield', detail: 'Equirectangular sky · Orbit' },
] as const;

export const structureCards = [
  { id: 'overhead-assembly', name: 'Overhead assembly', detail: 'Ceiling beam with angled plates and short hangers.' },
  { id: 'ventilation-assembly', name: 'Ventilation assembly', detail: 'Wall fan, grille and a short exhaust duct.' },
  { id: 'utility-conduits', name: 'Utility conduits', detail: 'Bent pipework, branch line and cable tray.' },
  { id: 'service-bay', name: 'Service bay', detail: 'Recessed maintenance panel with modular connections.' },
  { id: 'holographic-service-door', name: 'Holographic service door', detail: 'A wall-mounted access panel with a translucent display.' },
] as const satisfies readonly { id: StructureKind; name: string; detail: string }[];
