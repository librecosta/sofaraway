import { daybreakStems, sections as daybreakSections, tail as daybreakTail } from '../../core/daybreak-score';
import type { AudioStem } from '../../audio/stem-routing';
import type { VolumeDefinition } from '../../core/volumes';

export type TrackId = 'master' | AudioStem;
export type TrackMix = { level: number; muted: boolean };
export type Mix = Record<TrackId, TrackMix>;
export const trackInfo = {
  master: { label: 'Master', color: '#b9d2dc' },
  kick: { label: 'Kick', color: '#71c8e8' },
  snare: { label: 'Snare', color: '#719fd8' },
  hats: { label: 'Hats', color: '#80b7df' },
  keys: { label: 'Keys', color: '#a8cfe6' },
  lead: { label: 'Lead', color: '#f0c987' },
  atmos: { label: 'Atmos', color: '#b6c3d6' },
  bass: { label: 'Bass', color: '#9ab7fa' },
  arp: { label: 'Arp', color: '#c4a8ef' },
  pad: { label: 'Pad', color: '#97d7c6' },
  fx: { label: 'FX', color: '#d6b7c9' },
  signal: { label: 'Signal', color: '#91dbdb' },
  chord: { label: 'Chord', color: '#b4a6e5' },
  metal: { label: 'Metal', color: '#d7b3a4' },
  sweep: { label: 'Sweep', color: '#bac5d6' },
  perc: { label: 'Percussion', color: '#c9b893' },
  pluck: { label: 'Pluck', color: '#acd4f1' },
} as const;

export function defaultMix(): Mix {
  const track = () => ({ level: 1, muted: false });
  return Object.fromEntries(Object.keys(trackInfo).map(id => [id, track()])) as Mix;
}

export type InspectorArrangement = 'original' | 'm1';
export function inspectorScore(volume: VolumeDefinition, requested: InspectorArrangement = 'original') {
  const arrangement = volume.id === 'orbit' ? requested : 'original';
  const beatSeconds = 60 / volume.bpm;
  let startBeat = 0;
  const sections = volume.music === 'breakbeat' ? daybreakSections : volume.sections.map(({ name, beats }) => {
    const start = startBeat * beatSeconds;
    startBeat += beats;
    return { name, start, end: startBeat * beatSeconds };
  });
  const tracks: readonly TrackId[] = ['master', ...stemsFor(volume, arrangement)];
  const duration = volume.beats * beatSeconds;
  const tail = volume.soundtrack?.tail ?? (volume.music === 'breakbeat' ? daybreakTail : 4);
  return { volume, arrangement, key:volume.id + ':' + arrangement, sections, tracks,
    duration, tail, length: duration + tail, step: beatSeconds / 4 };
}

export type InspectorScore = ReturnType<typeof inspectorScore>;

/** Ordered by rhythm, bass, harmony, melody and transitions, with score voice identities. */
export function stemsFor(volume: VolumeDefinition, arrangement: InspectorArrangement = 'original'): readonly AudioStem[] {
  switch (volume.music) {
    case 'breakbeat': return daybreakStems;
    case 'control': return ['kick', 'snare', 'hats', 'bass', 'chord', 'signal', 'metal', 'sweep'];
    case 'starwake': return arrangement === 'm1' ? ['kick','snare','hats','perc','pad','lead','sweep']
      : ['kick', 'snare', 'hats', 'perc', 'bass', 'pad', 'pluck', 'lead', 'sweep'];
    default: return ['kick', 'snare', 'hats', 'bass', 'pad', 'arp', 'fx'];
  }
}
export function stemMetadata(volume: VolumeDefinition, arrangement: InspectorArrangement = 'original') {
  const voices: Partial<Record<AudioStem, readonly string[]>> = {
    snare: volume.music === 'techno' ? ['snare', 'fill'] : volume.music === 'breakbeat' ? ['snare', 'ghost', 'fill']
      : volume.music === 'control' ? ['snare', 'ghost'] : ['snare'],
    hats: ['hat'], arp: ['pluck'], fx: ['riser', 'impact'], keys: ['pad', 'pluck', 'arp'], atmos: ['air'],
  };
  return stemsFor(volume,arrangement).map(id => ({ id, volume: volume.id, ...trackInfo[id], voices: voices[id] ?? [id] }));
}

// Includes held notes and their effect returns before a chunk's visible range.
export function inspectorPreroll(score: InspectorScore) {
  return score.volume.music === 'starwake' ? 8 : score.volume.music === 'control' ? 4 : 6;
}
