import { describe, expect, it } from 'vitest';
import { VOLUMES } from '../../app/game/core/volumes';
import { defaultMix, inspectorScore, stemMetadata, stemsFor } from '../../app/game/debug/audio/track-adapter';

describe('four-volume Inspector contract', () => {
  it('uses the authoritative duration, sections, tails and real voice identities', () => {
    const counts = [7, 6, 8, 7];
    for (const [index, volume] of VOLUMES.entries()) {
      const score = inspectorScore(volume), stems = stemsFor(volume), metadata = stemMetadata(volume);
      expect(stems).toHaveLength(counts[index]);
      expect(new Set(stems).size).toBe(stems.length);
      expect(score.tracks).toEqual(['master', ...stems]);
      expect(score.sections.at(-1)!.end).toBeCloseTo(volume.beats * 60 / volume.bpm);
      expect(score.length).toBe(score.duration + score.tail);
      expect(metadata.every(track => track.volume === volume.id && track.voices.length > 0)).toBe(true);
      expect(metadata.map(track => track.id)).toEqual(stems);
    }
    expect(stemsFor(VOLUMES[0])).not.toContain('lead');
    expect(stemMetadata(VOLUMES[0]).find(track => track.id === 'fx')!.voices).toEqual(['riser', 'impact']);
    expect(stemMetadata(VOLUMES[2]).find(track => track.id === 'snare')!.voices).toContain('ghost');
  });

  it('creates independent unity mix state for each volume and reset', () => {
    const a = defaultMix(), b = defaultMix();
    a.kick.level = .4; a.pad.muted = true;
    expect(b.kick).toEqual({ level: 1, muted: false });
    expect(b.pad).toEqual({ level: 1, muted: false });
    expect(a.snare).toEqual({ level: 1, muted: false });
  });
});
