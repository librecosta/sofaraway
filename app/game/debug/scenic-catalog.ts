import type { PlayMode } from '../contracts';
import type { RouteSide } from '../core/branches';
import type { LightingZoneKind } from '../core/scenic-plan';
import type { StructureKind } from '../core/dressing';

export interface ScenicExample {
  readonly label: string; readonly beat: number;
  readonly side?: RouteSide; readonly boost?: boolean; readonly mode?: PlayMode;
  readonly zone?: LightingZoneKind;
  readonly wall?: StructureKind;
}
export const scenicExamples: readonly ScenicExample[] = [
  { label: 'INTRO · structural ceiling', beat: 5.6 },
  { label: 'A · continuous edge', beat: 76 },
  { label: 'A · paired ceiling slots', beat: 40, zone: 'ceiling-pair' },
  { label: 'B · recessed ventilation', beat: 111.5, wall: 'ventilation-assembly' },
  { label: 'BUILD · ordered chase', beat: 172, zone: 'ordered-rhythm' },
  { label: 'DROP · beat pulse', beat: 204 },
  { label: 'BREAK · quiet walls', beat: 298 },
  { label: 'A2 · junction approach', beat: 319.5 },
  { label: 'Main tunnel', beat: 334, side: 'center' },
  { label: 'Challenge tunnel', beat: 334, side: 'right' },
  { label: 'Bonus tunnel', beat: 334, side: 'left' },
  { label: 'FINALE · warm-to-cool color score', beat: 401 },
  { label: 'Sightseeing · recessed wall up close', beat: 111, mode: 'sightseeing', wall: 'ventilation-assembly' },
  { label: 'Boost · flight through DROP', beat: 229, boost: true },
];
