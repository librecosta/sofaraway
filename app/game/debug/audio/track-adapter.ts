import { daybreakStems, sections as daybreakSections } from '../../core/daybreak-score';
import type { DaybreakStem } from '../../core/daybreak-score';
import type { VolumeDefinition } from '../../core/volumes';

export type TrackId = 'master' | DaybreakStem;
export type TrackMix = { level: number; muted: boolean };
export type Mix = Record<TrackId, TrackMix>;
export const trackInfo = {
  master: { label: 'Master', color: '#b9d2dc' }, kick: { label: 'Kick', color: '#71c8e8' },
  snare: { label: 'Snare', color: '#719fd8' }, hats: { label: 'Hats', color: '#80b7df' },
} as const;

export function defaultMix(): Mix {
  const track = () => ({ level: 1, muted: false });
  return { master: track(), kick: track(), snare: track(), hats: track() };
}

export function inspectorScore(volume: VolumeDefinition) {
  const beatSeconds = 60 / volume.bpm;
  let startBeat = 0;
  const sections = volume.music === 'breakbeat' ? daybreakSections : volume.sections.map(({ name, beats }) => {
    const start = startBeat * beatSeconds;
    startBeat += beats;
    return { name, start, end: startBeat * beatSeconds };
  });
  const tracks: readonly TrackId[] = volume.music === 'breakbeat' ? ['master', ...daybreakStems] : ['master'];
  return { volume, sections, tracks, duration: volume.beats * beatSeconds, step: beatSeconds / 4 };
}

export type InspectorScore = ReturnType<typeof inspectorScore>;
