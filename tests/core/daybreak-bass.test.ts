import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { bpm, duration, onset, rhythmTimeline, score, sections, step, swing } from '../../app/game/core/daybreak-score';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('only the five middle Bass parts differ from the D1-M2 score', () => {
  // Event digests from 871e91c, including every preserved note, onset and level.
  expect(digest(score.filter(bar => bar.section === 'OPEN').map(bar => bar.bass)))
    .toBe('993acd1e1c38d49d474258381123559927bc59b2c96de1ea4495d501926a75c8');
  expect(digest(score.filter(bar => bar.section === 'OUTRO').map(bar => bar.bass)))
    .toBe('740584049279d69375056644453bb1f82b40fce7076d894933cb9524dc4833e1');
  expect(digest(score.map(({ bass, ...frame }) => frame)))
    .toBe('20323cc05b5a90c0255ea9e10766b864b2be8b5e04621f3540e5f6a448b700af');
  expect(digest(rhythmTimeline())).toBe('00da1861a918f21cb14d5cd401e08d4ebe3ec254d0ffc23cea12c0554a9db8cf');
  expect([bpm, duration, sections.at(-1)?.endBeat, swing]).toEqual([120, 144, 288, .085]);
});

test('the middle Bass keeps its register, leaves the backbeat clear and varies with section energy', () => {
  const middle = sections.slice(1, -1);
  const densities = [];
  let fifths = 0;
  for (const section of middle) {
    const bars = score.slice(section.startBar, section.endBar);
    densities.push(bars.flatMap(bar => bar.bass).length / bars.length);
    let kickAnchors = 0, offbeatNotes = 0;
    for (const { bar, bass, chord, kicks, snares, fill } of bars) {
      expect(bass.length).toBeGreaterThanOrEqual(section.name === 'BREEZE' ? 1 : 2);
      expect(bass.length).toBeLessThanOrEqual(3);
      expect(bass[0][1]).toBe(0);
      for (const [i, [position, interval, length, velocity]] of bass.entries()) {
        expect([0, 7]).toContain(interval);
        expect(chord.bass + interval).toBeLessThanOrEqual(45);
        if (interval) {
          fifths++;
          expect(chord.keys.some(note => note % 12 === (chord.bass + interval) % 12)).toBe(true);
          expect(i).toBe(bass.length - 1);
        }
        expect(velocity).toBeGreaterThan(0);
        expect(velocity).toBeLessThanOrEqual(1);
        expect([...snares, ...fill]).not.toContain(position);
        if (kicks.includes(position)) kickAnchors++;
        else offbeatNotes++;
        const releaseEnd = onset(bar, position, swing / 2) + length * step + .075;
        const next = bass[i + 1];
        expect(releaseEnd).toBeLessThanOrEqual(next ? onset(bar, next[0], swing / 2) : onset(bar + 1));
      }
    }
    expect(kickAnchors).toBeGreaterThan(0);
    expect(offbeatNotes).toBeGreaterThan(kickAnchors);
  }
  expect(fifths).toBeLessThanOrEqual(6);
  const [glide, lift, breeze, sunburst, returning] = densities;
  expect(breeze).toBeLessThan(returning);
  expect(glide).toBeLessThan(lift);
  expect(lift).toBeLessThan(sunburst);
  expect(returning).toBeLessThan(sunburst);
});
