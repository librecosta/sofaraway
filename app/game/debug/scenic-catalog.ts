import type { PlayMode } from '../contracts';
import type { RouteSide } from '../core/branches';

export interface ScenicExample {
  readonly label: string; readonly beat: number;
  readonly side?: RouteSide; readonly boost?: boolean; readonly mode?: PlayMode;
}
export const scenicExamples: readonly ScenicExample[] = [
  { label: 'Arrival corridor', beat: 5.6 },
  { label: 'Wall service corridor', beat: 111.5 },
  { label: 'Lighting build-up', beat: 176 },
  { label: 'Drop and blackout', beat: 193 },
  { label: 'Warm break', beat: 298 },
  { label: 'Junction approach', beat: 319.5 },
  { label: 'Main tunnel', beat: 334, side: 'center' },
  { label: 'Challenge tunnel', beat: 334, side: 'right' },
  { label: 'Bonus tunnel', beat: 334, side: 'left' },
  { label: 'Finale portals', beat: 401 },
  { label: 'Wall details at sightseeing speed', beat: 11, mode: 'sightseeing' },
  { label: 'Boost through the service corridor', beat: 229, boost: true },
];
