import type { VolumeId } from '../contracts';
import { lanePoint, opening, type Axis } from '../core/collision';
import { daybreakGateKinds, daybreakGates, isDaybreakGate } from '../core/daybreak-gates';
import { descentDirections, descentGateKinds, isDescentGate } from '../core/descent-gates';
import type { DescentGateKind } from '../core/descent-gates';
import { isOrbitGate, orbitGateKinds, orbitPresets } from '../core/orbit-gates';
import type { GateKind } from '../core/volumes';

export const gateFamilies = {
  elsewhere: ['iris', 'square', 'diamond'], daybreak: daybreakGateKinds,
  descent: descentGateKinds, orbit: orbitGateKinds,
} as const satisfies Record<VolumeId, readonly GateKind[]>;

const gateNotes = {
  iris: 'One open wedge around a solid hub.',
  square: 'Fixed square opening at the centre.',
  diamond: 'Fixed diamond opening at the centre.',
};

const descentDescriptions = {
  'laser-matrix': { label: 'Matrix 3×3', note: 'Beveled glass panels frame one of eight open outer cells.' },
  'laser-slice': { label: 'Slice Gate', note: 'Glass banks leave a full-width or full-height passage.' },
  'laser-weave': { label: 'Diagonal Weave', note: 'Mirrored glass wedges frame a diagonal passage.' },
};

type GateOpening = { label: string; open: number; axis: Axis };
export const descentExamples: Record<DescentGateKind, readonly GateOpening[]> = {
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

const irisOpenings = ['Right', 'Upper right', 'Top', 'Upper left', 'Left', 'Lower left', 'Bottom', 'Lower right'];

export function gateOpenings(kind: GateKind): readonly GateOpening[] {
  if (isDescentGate(kind)) return descentExamples[kind];
  const labels = isOrbitGate(kind) ? orbitPresets[kind].map(preset => preset.label)
    : isDaybreakGate(kind) ? daybreakGates[kind].openings : kind === 'iris' ? irisOpenings : ['Center'];
  const variants: GateOpening[] = labels.map((label, open) => ({ label, open, axis: 0 }));
  return kind === 'daybreak-crystal' ? [{ label: 'Complete layout', open: -1, axis: 0 }, ...variants] : variants;
}

export function gateOpeningAt(kind: GateKind, open: number, axis: number): GateOpening | undefined {
  if (!Number.isInteger(open) || (axis !== 0 && axis !== 1)) return;
  const variants = gateOpenings(kind);
  const exact = variants.find(variant => variant.open === open && variant.axis === axis);
  if (exact || open < 0 || opening(kind, open) !== open) return exact;
  const [x, y] = lanePoint(kind, open, axis);
  const equivalent = variants.find(variant => {
    if (variant.open === -1 || (isDescentGate(kind) && kind !== 'laser-matrix' && variant.axis !== axis)) return false;
    const [vx, vy] = lanePoint(kind, variant.open, variant.axis);
    return vx === x && vy === y;
  });
  return { open, axis, label: equivalent?.label ?? variants.find(item => item.open === open)!.label };
}

export function gateDescription(kind: GateKind) {
  if (isOrbitGate(kind)) return { label: kind === 'orbit-single' ? 'Single Aperture' : kind === 'orbit-dual' ? 'Dual Aperture' : 'Triple Aperture',
    note: `${orbitPresets[kind].length} fixed variants · real circle, square and diamond throats through beveled holographic glass.` };
  if (isDescentGate(kind)) return descentDescriptions[kind];
  if (isDaybreakGate(kind)) {
    const { label } = daybreakGates[kind];
    return { label, note: kind === 'daybreak-crystal' ? 'One of eight radial slices opens around a solid octagonal hub.'
      : kind === 'daybreak-vertical' ? 'Fixed tall opening with four clipped corners.' : 'Fixed wide hexagonal opening.' };
  }
  return { label: kind[0].toUpperCase() + kind.slice(1), note: gateNotes[kind] };
}

export const pickupCards = [
  { kind: 'shield', name: 'Prism Shield', color: '#64d8ff', effect: 'Blocks one hit that would cost a life.' },
  { kind: 'resonance', name: 'Resonance', color: '#ff84e1', effect: '+25% score on the next 8 gates you pass.' },
  { kind: 'lumen', name: 'Lumen', color: '#ffe680', effect: '+2,500 / 5,000 / 7,500 / 10,000 points by difficulty.' },
] as const;
