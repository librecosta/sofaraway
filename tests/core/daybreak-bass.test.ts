import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { bpm, duration, onset, rhythmTimeline, score, sections, step, swing } from '../../app/game/core/daybreak-score';
import { warmSubRelease } from '../../app/game/audio/daybreak-voices.client';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('the new foundation preserves the edge Bass and every non-Bass event', () => {
  // Event digests shared by 871e91c and the D1-M3-F1 baseline 4c56a7f.
  expect(digest(score.filter(bar => bar.section === 'OPEN').map(bar => bar.bass)))
    .toBe('993acd1e1c38d49d474258381123559927bc59b2c96de1ea4495d501926a75c8');
  expect(digest(score.filter(bar => bar.section === 'OUTRO').map(bar => bar.bass)))
    .toBe('740584049279d69375056644453bb1f82b40fce7076d894933cb9524dc4833e1');
  expect(digest(score.map(({ bass, ...frame }) => frame)))
    .toBe('20323cc05b5a90c0255ea9e10766b864b2be8b5e04621f3540e5f6a448b700af');
  expect(digest(rhythmTimeline())).toBe('00da1861a918f21cb14d5cd401e08d4ebe3ec254d0ffc23cea12c0554a9db8cf');
  expect([bpm, duration, sections.at(-1)?.endBeat, swing]).toEqual([120, 144, 288, .085]);
});

test('the foundation supports the chord bass and the main Kick accents with room between notes', () => {
  const middle = sections.slice(1, -1);
  const densities = [];
  for (const section of middle) {
    const bars = score.slice(section.startBar, section.endBar);
    densities.push(bars.flatMap(bar => bar.bass).length / bars.length);
    for (const { bar, bass, kicks, snares, fill } of bars) {
      expect(bass.length).toBeGreaterThan(0);
      expect(bass.length).toBeLessThanOrEqual(section.name === 'SUNBURST' ? 3 : 2);
      expect(kicks).toContain(bass[0][0]);
      for (const [i, [position, interval, length, velocity]] of bass.entries()) {
        expect(interval).toBe(0);
        expect(velocity).toBeGreaterThan(0);
        expect(velocity).toBeLessThanOrEqual(1);
        expect([...snares, ...fill]).not.toContain(position);
        const releaseEnd = onset(bar, position, swing / 2) + length * step + warmSubRelease;
        const next = bass[i + 1];
        expect(releaseEnd).toBeLessThanOrEqual(next ? onset(bar, next[0], swing / 2) : onset(bar + 1));
      }
    }
  }
  const [glide, lift, breeze, sunburst, returning] = densities;
  expect(breeze).toBeLessThan(Math.min(glide, lift, returning));
  expect(sunburst).toBeGreaterThan(Math.max(glide, lift, returning));
});
