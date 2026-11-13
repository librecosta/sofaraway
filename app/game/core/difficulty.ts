import { difficulties } from '../contracts';
import type { Difficulty, VolumeId } from '../contracts';

export const IMPOSSIBLE_SPEED_FACTOR = 1.15;
export const IMPOSSIBLE_SCORE_MULTIPLIER = 3.4;
export const IMPOSSIBLE_LIVES = 1;
const elsewhereDifficulties = [...difficulties, 'impossible'] as const;

export function difficultiesFor(volume: VolumeId): readonly Difficulty[] {
  return volume === 'elsewhere' ? elsewhereDifficulties : difficulties;
}

export function supportsDifficulty(volume: VolumeId, value: unknown): value is Difficulty {
  return difficultiesFor(volume).some(difficulty => difficulty === value);
}

export function resolveDifficulty(volume: VolumeId, value: unknown): Difficulty {
  return supportsDifficulty(volume, value) ? value : 'normal';
}
