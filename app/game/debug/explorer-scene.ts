import type { PlayMode, QualityTier, VolumeId } from '../contracts';
import { clamp } from '../core/collision';
import { referenceFor, START_DISTANCE } from '../core/reference-track';
import type { VolumeDefinition } from '../core/volumes';

export function previewNumber(query: URLSearchParams, key: string, fallback: number, min: number, max: number) {
  const raw = query.get(key);
  const value = raw?.trim() ? Number(raw) : NaN;
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

export function previewQuality(query: URLSearchParams, fallback: QualityTier = 'auto'): QualityTier {
  const value = query.get('q');
  return value === 'low' || value === 'auto' || value === 'high' ? value : fallback;
}

export function stationBeat(volume: VolumeDefinition, station: number, mode: PlayMode = 'standard') {
  const reference = referenceFor(volume);
  let lo = 0, hi = volume.beats;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (reference.station(mid, mode) < station) lo = mid;
    else hi = mid;
  }
  return station <= START_DISTANCE ? 0 : (lo + hi) / 2;
}

export function previewGameHref(id: VolumeId, seconds: number, quality: QualityTier, dynamic = true,
  mode: PlayMode = 'standard', route?: string, boost = false) {
  return '/?' + new URLSearchParams({ vol: id, t: seconds.toFixed(9), q: quality, mode, align: '1',
    god: '0', lights: String(dynamic), ...(route ? { route } : {}), ...(boost ? { boost: '1' } : {}) });
}
