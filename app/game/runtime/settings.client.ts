import { difficulties, qualities } from '../contracts';
import type { Difficulty, GameOptions, QualityTier } from '../contracts';
import { clamp } from '../core/collision';
import { volumeById } from '../core/volumes';

type Setting = 'difficulty' | 'quality' | 'volume' | 'muted' | 'best';

function read(key: Setting) {
  try { return localStorage.getItem('sofaraway.' + key); } catch { return null; }
}

export function saveSetting(key: Setting, value: string | number | boolean) {
  try { localStorage.setItem('sofaraway.' + key, String(value)); } catch { /* storage is optional */ }
}

export function readOptions(params: URLSearchParams): GameOptions {
  const capture = Number.parseFloat(params.get('t') ?? '');
  const fixedTime = Number.isFinite(capture) && capture >= 0 ? capture : null;
  const selectedDifficulty = (fixedTime !== null ? params.get('diff') : null) ?? read('difficulty');
  const quality = params.get('q') ?? read('quality');
  const volume = Number(read('volume') ?? 80);
  const best = Number(read('best') ?? 0);
  const pair = (name: string) => params.get(name)?.split(',').map(Number) ?? [];
  const [x, y] = pair('cur');
  const [aperture, blur] = pair('dof');
  const branchSide = fixedTime !== null ? params.get('route') : null;
  return {
    volumeId: volumeById(params.get('vol')).id,
    difficulty: difficulties.includes(selectedDifficulty as Difficulty) ? selectedDifficulty as Difficulty : 'normal',
    quality: qualities.includes(quality as QualityTier) ? quality as QualityTier : 'auto',
    volume: Number.isFinite(volume) ? clamp(volume / 100, 0, 1) : 0.8,
    muted: read('muted') === 'true',
    best: Number.isFinite(best) ? Math.max(best, 0) : 0,
    diagnostics: {
      fixedTime, autoplay: params.get('auto') === '1', align: params.get('align') === '1',
      god: params.get('god') === '1' || (fixedTime !== null && !params.has('god')),
      boost: params.get('boost') === '1', mobileQuality: quality === 'mobile',
      post: params.get('post') !== '0', record: params.get('rec') === '1', debug: params.get('dbg') === '1',
      cursor: Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined,
      dof: Number.isFinite(aperture) ? [aperture, Number.isFinite(blur) ? blur : undefined] : undefined,
      branchSide: branchSide === 'left' || branchSide === 'right' || branchSide === 'center' ? branchSide : undefined,
    },
  };
}
