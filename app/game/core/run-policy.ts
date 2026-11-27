import type { GameOptions, PlayMode, VolumeId } from '../contracts';
import { resolveDifficulty } from './difficulty';
import { CAPTURE_RUN_SEED } from './run-seed';

type RunPurpose = 'menu' | 'run' | 'capture';
type RunSettings = Pick<GameOptions, 'diagnostics' | 'runSeed' | 'showcaseSeed' | 'saveRecords'>;
interface RunSelection {
  readonly volumeId: VolumeId;
  readonly mode: unknown;
  readonly difficulty: unknown;
  readonly showcaseRoute?: unknown;
  readonly autoBoost?: boolean;
}

function validSeed(seed: number | undefined) {
  return seed !== undefined && Number.isInteger(seed) && seed >= 0 && seed < 0xffffffff ? seed : undefined;
}

export function resolveRunPolicy(selection: RunSelection, settings: RunSettings, purpose: RunPurpose) {
  const { volumeId, showcaseRoute: route } = selection;
  const showcase = selection.mode === 'showcase';
  const mode: PlayMode = selection.mode === 'sightseeing' ? 'sightseeing' : 'standard';
  const difficulty = showcase ? 'impossible' : mode === 'sightseeing' ? 'normal' : resolveDifficulty(volumeId, selection.difficulty);
  const diagnostics = typeof __PLAYER_ONLY_TOY__ === 'undefined' ? settings.diagnostics : undefined;
  const ordinary = diagnostics?.fixedTime == null && !diagnostics?.autoplay;
  const runSeed = typeof __PLAYER_ONLY_TOY__ === 'undefined' ? settings.runSeed : undefined;
  const showcaseSeed = typeof __PLAYER_ONLY_TOY__ === 'undefined' ? settings.showcaseSeed : undefined;
  return {
    volumeId, mode, difficulty,
    referenceDifficulty: purpose === 'menu' && !showcase ? 'normal' : difficulty,
    seed: validSeed(runSeed) ?? (showcase ? validSeed(showcaseSeed) ?? CAPTURE_RUN_SEED
      : purpose === 'capture' ? CAPTURE_RUN_SEED : undefined),
    scoring: !showcase,
    showcaseRoute: showcase ? route === 'challenge' || route === 'score' ? route : 'main' : null,
    allowSimulationDiagnostics: !!diagnostics && !showcase,
    autoBoost: purpose === 'run' && ordinary && !showcase &&
      mode === 'standard' && selection.autoBoost === true,
    captureBoost: purpose === 'capture' && diagnostics?.boost === true,
    recordsEligible: purpose === 'run' && !!settings.saveRecords && !showcase &&
      ordinary && !diagnostics?.god && !diagnostics?.align && !diagnostics?.debug && !diagnostics?.record,
  } as const;
}

export type RunPolicy = ReturnType<typeof resolveRunPolicy>;
