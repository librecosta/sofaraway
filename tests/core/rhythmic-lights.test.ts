import { describe, expect, it } from 'vitest';
import { drumStrengths, rhythmicLightGain } from '../../app/game/core/rhythmic-lights';
import { sectionAt, VOLUMES } from '../../app/game/core/volumes';

describe('dynamic structural lighting', () => {
  it('preserves the authored kick, snare and roll events on every score step', () => {
    for (const volume of VOLUMES) {
      for (let step = 0; step < volume.beats * 4; step++) {
        const energy = sectionAt(volume, step / 4)?.energy ?? .15;
        const s = step % 16;
        const ending = step / 4 > volume.beats - 8;
        const halfTime = volume.music === 'industrial';
        expect(drumStrengths(volume, step, energy)).toEqual({
          kick: !ending && (halfTime ? s === 0 || s === 10 : s % 4 === 0 && energy > .20) ? .55 + energy * .45 : 0,
          snare: !ending && energy > .42 && (halfTime ? s === 8 : s === 4 || s === 12) ? .5 + energy * .5 : 0,
          fill: Math.floor(step / 16) % 4 === 3 && s >= 12 && energy > .6 ? .35 + (s - 12) * .14 : 0,
        });
      }
    }
  });

  it('keeps off and reduced motion at baseline and gives each score a bounded pulse', () => {
    for (const volume of VOLUMES) {
      let peak = 1;
      for (let beat = 0; beat < volume.beats; beat += 1 / 8) {
        const gain = rhythmicLightGain(volume, beat, 1);
        peak = Math.max(gain, peak);
        expect(rhythmicLightGain(volume, beat, 0)).toBe(1);
        expect(rhythmicLightGain(volume, beat, 1, true)).toBe(1);
        expect(gain).toBeGreaterThanOrEqual(1);
        expect(gain).toBeLessThanOrEqual(1.30);
      }
      expect(peak).toBeGreaterThan(1.13);
      expect(rhythmicLightGain(volume, volume.beats - 1, 1)).toBe(1);
    }
  });

  it('responds to kick and snare onsets and leaves the break quieter than the drop', () => {
    const volume = VOLUMES[0];
    const beat = 208;
    expect(rhythmicLightGain(volume, beat + .18, 1)).toBeGreaterThan(rhythmicLightGain(volume, beat, 1));
    expect(rhythmicLightGain(volume, beat + 1.14, 1)).toBeGreaterThan(rhythmicLightGain(volume, beat + 1, 1));
    const peak = (name: string) => {
      let max = 1;
      for (let beat = 0; beat < volume.beats; beat += .125) {
        if (sectionAt(volume, beat)?.name === name) max = Math.max(max, rhythmicLightGain(volume, beat, 1));
      }
      return max;
    };
    expect(peak('DROP')).toBeGreaterThan(peak('BUILD'));
    expect(peak('DROP')).toBeGreaterThan(peak('BREAK'));
    expect(peak('FINALE')).toBeGreaterThan(peak('BREAK'));
  });
});
