import type { RouteSide } from '../core/branches';
import { curveEndBeat, curveStartBeat, lightingWindows } from '../core/corridor-composition';
import { corridorLabels } from '../core/lighting-atlas';
import type { CorridorLightingKind } from '../core/lighting-atlas';

export interface ScenicExample {
  readonly label: string;
  readonly beat: number;
  readonly kind?: CorridorLightingKind;
  readonly side?: RouteSide;
  readonly boost?: boolean;
  readonly curveT?: number;
}

export const scenicExamples: readonly ScenicExample[] = [
  { label: 'Pure Frame', beat: 5, kind: 'pure-frame' },
  ...lightingWindows.flatMap(([kind, start]) => kind === 'pure-frame' ? []
    : [{ label: corridorLabels[kind], beat: start + (kind === 'raked-bands' ? 1 : 2), kind }]),
  { label: 'Junction approach', beat: 319.4 },
  { label: 'Main tunnel', beat: 334, side: 'center' },
  { label: 'Challenge tunnel', beat: 334, side: 'right' },
  { label: 'Bonus tunnel', beat: 334, side: 'left' },
  { label: 'S-Curve · sustained Boost', beat: 225, boost: true },
];

export const curveExamples: readonly ScenicExample[] = [
  ['Entry', 0], ['First lateral peak', 1 / 3], ['Midpoint', .5], ['Second lateral peak', 2 / 3], ['Exit', 1],
].map(([label, t]) => ({
  label: String(label), beat: curveStartBeat + (curveEndBeat - curveStartBeat) * Number(t), curveT: Number(t),
}));
