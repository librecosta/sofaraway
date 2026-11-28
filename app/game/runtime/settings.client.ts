import { experienceModes, initialSnapshot, qualities } from '../contracts';
import type { ExperienceMode, GameOptions, OrientationPreference, QualityTier, VolumeId } from '../contracts';
import { clamp } from '../core/collision';
import { resolveDifficulty } from '../core/difficulty';

type Setting = 'difficulty' | 'mode' | 'quality' | 'volume' | 'muted' | 'dynamicLights' |
  'immersiveMouse' | 'orientation' | 'locale' | 'autoBoost' | 'centerReticle';

export function createPlayerSettings(namespace: string) {
  return {
    namespace,
    read(key: Setting) {
      try { return localStorage.getItem(`${namespace}.${key}`); } catch { return null; }
    },
    save(key: Setting, value: string | number | boolean) {
      try { localStorage.setItem(`${namespace}.${key}`, String(value)); } catch { /* storage is optional */ }
    },
  };
}

export type PlayerSettings = ReturnType<typeof createPlayerSettings>;
export const webSettings = createPlayerSettings('sofaraway');

export function readOrientationPreference(settings: PlayerSettings): OrientationPreference {
  return settings.read('orientation') === 'portrait' ? 'portrait' : 'landscape';
}

export function readPlayerOptions(settings: PlayerSettings, volumeId: VolumeId, overrides?: {
  difficulty?: string | null; mode?: string | null; quality?: string | null; lights?: string | null;
}): Omit<GameOptions, 'diagnostics'> {
  const difficulty = overrides?.difficulty ?? settings.read('difficulty');
  const mode = overrides?.mode ?? settings.read('mode');
  const quality = overrides?.quality ?? settings.read('quality');
  const volume = Number(settings.read('volume') ?? 80);
  const immersiveMouse = settings.read('immersiveMouse');
  return {
    volumeId,
    difficulty: resolveDifficulty(volumeId, difficulty),
    mode: experienceModes.includes(mode as ExperienceMode) ? mode as ExperienceMode : 'standard',
    quality: qualities.includes(quality as QualityTier) ? quality as QualityTier : 'auto',
    volume: Number.isFinite(volume) ? clamp(volume / 100, 0, 1) : 0.8,
    muted: settings.read('muted') === 'true',
    dynamicLights: (overrides?.lights ?? settings.read('dynamicLights')) === 'true',
    immersiveMouse: immersiveMouse === 'true' || (immersiveMouse !== 'false' && initialSnapshot.immersiveMouse),
    autoBoost: settings.read('autoBoost') === 'true',
    centerReticle: settings.read('centerReticle') === 'true',
  };
}
