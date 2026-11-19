import { expect, test } from 'vitest';
import { bpm, beatSeconds, makeStarwakeScore, starwakeEvents, starwakePhrases,
  starwakeSteps, starwakeTheme, starwakeTrack, step } from '../../app/game/core/orbit-score';
import { volumeById } from '../../app/game/core/volumes';

const between = (start: number, end: number) => starwakeEvents.filter(event => event.bar >= start && event.bar < end);

test('STARWAKE owns a 180-second, 96-bar score and supplies the playable ORBIT course', () => {
  expect([bpm, starwakeTrack.beatsPerBar, starwakeTrack.bars, starwakeTrack.beats,
    starwakeTrack.duration, starwakeTrack.tail]).toEqual([128, 4, 96, 384, 180, 4]);
  expect(starwakeTrack.sections.map(({ name, startBar, endBar, start, end }) => [name, startBar, endBar, start, end]))
    .toEqual([['OUTER BELT', 0, 8, 0, 15], ['DRIFT', 8, 24, 15, 45], ['RINGBREAK', 24, 40, 45, 75],
      ['MAELSTROM', 40, 56, 75, 105], ['ECLIPSE', 56, 64, 105, 120],
      ['AURORA', 64, 80, 120, 150], ['APHELION', 80, 96, 150, 180]]);
  expect(volumeById('orbit')).toMatchObject({ bpm: 128, beats: 384, music: 'starwake', soundtrack: starwakeTrack });
});

test('event identity, fractional onsets and section metadata survive regeneration and step indexing', () => {
  expect(makeStarwakeScore()).toEqual(starwakeEvents);
  expect(new Set(starwakeEvents.map(event => event.identity)).size).toBe(starwakeEvents.length);
  expect(starwakeSteps).toHaveLength(96 * 16);
  expect(starwakeSteps.flat().sort((a, b) => a - b)).toEqual(starwakeEvents.map(event => event.id));
  for (const [i, event] of starwakeEvents.entries()) {
    expect(event.at).toBeCloseTo(event.beat * beatSeconds, 10);
    expect(event.at).toBeGreaterThanOrEqual(starwakeEvents[i - 1]?.at ?? 0);
    expect(event.at).toBeLessThan(starwakeTrack.duration);
    expect(event.velocity).toBeGreaterThan(0);
    expect(event.velocity).toBeLessThanOrEqual(1);
    if ('length' in event) {
      expect(event.length).toBeGreaterThan(0);
      expect(event.at + event.length).toBeLessThan(starwakeTrack.duration + 1);
    }
    const pitches = 'notes' in event ? event.notes : 'note' in event ? [event.note] : [];
    expect(pitches.every(note => Number.isInteger(note) && note >= 24 && note <= 84)).toBe(true);
    const section = starwakeTrack.sections.find(part => event.bar < part.endBar)!;
    expect(event.section).toBe(section.name);
    expect(event.beat).toBeGreaterThanOrEqual(section.startBeat);
  }
  expect(starwakeEvents.some(event => event.at / step % 1 !== 0)).toBe(true);
  expect(new Set(starwakeEvents.map(event => event.voice))).toEqual(new Set(
    ['kick', 'snare', 'hat', 'perc', 'bass', 'pad', 'pluck', 'lead', 'sweep']));
  expect(starwakeEvents.some(event => event.fill && event.transition)).toBe(true);
});

test('the approved rising-fifth theme returns intact with longer AURORA articulations', () => {
  expect(starwakeTheme.map(([, note]) => note)).toEqual([69, 72, 77, 76, 72, 74, 69, 67]);
  for (const start of [24, 64]) {
    const notes = between(start, start + 4).filter(event => event.voice === 'lead');
    expect(notes.map(event => [event.beat - start * 4, event.note])).toEqual(starwakeTheme.map(([at, note]) => [at, note]));
    expect(notes[0].length).toBeCloseTo(1.2 * beatSeconds * (start === 64 ? 1.12 : 1), 10);
  }
});

test('four-bar phrases develop harmony, bass and drums rather than duplicating the audition', () => {
  expect(starwakePhrases).toHaveLength(24);
  expect(starwakePhrases.every(([harmony]) => harmony.split(' ').length === 4)).toBe(true);
  const signature = (start: number, voices: string[]) => JSON.stringify(between(start, start + 4)
    .filter(event => voices.includes(event.voice)).map(({ voice, beat, velocity }) => [voice, beat - start * 4, velocity]));
  for (const [from, to] of [[8, 24], [24, 40], [40, 56], [64, 80]]) {
    const phrases = Array.from({ length: (to - from) / 4 }, (_, i) => signature(from + i * 4, ['kick', 'snare', 'hat', 'bass']));
    expect(new Set(phrases).size).toBe(phrases.length);
  }
  expect(signature(0, ['kick', 'snare', 'lead'])).not.toEqual(signature(48, ['kick', 'snare', 'lead']));
  expect(signature(80, ['kick', 'snare'])).not.toEqual(signature(88, ['kick', 'snare']));
  expect(between(40, 56).filter(event => event.voice === 'kick' && event.beat % 1 !== 0).length).toBeGreaterThan(8);
});

test('ECLIPSE retains audible musical parts and APHELION releases the rhythm before its final chord', () => {
  const eclipse = between(56, 64), aurora = between(64, 80);
  expect(eclipse.filter(event => event.voice === 'kick' || event.voice === 'snare').length)
    .toBeLessThan(aurora.filter(event => event.voice === 'kick' || event.voice === 'snare').length / 4);
  for (let bar = 56; bar < 64; bar++) expect(eclipse.some(event =>
    ['lead', 'pad', 'pluck', 'bass'].includes(event.voice) && event.at < (bar + 1) * 4 * beatSeconds
    && event.at + ('length' in event ? event.length : 0) > bar * 4 * beatSeconds)).toBe(true);
  expect(new Set(aurora.flatMap(event => event.voice === 'lead' ? [event.motif] : [])))
    .toEqual(new Set(['theme', 'lift', 'summit', 'release']));
  expect(aurora.some(event => event.voice === 'lead' && event.note === 79)).toBe(true);
  expect(between(95, 96).every(event => !['kick', 'snare', 'bass', 'hat', 'sweep'].includes(event.voice))).toBe(true);
  expect(starwakeEvents.filter(event => event.voice === 'lead').at(-1)).toMatchObject({ note: 65, bar: 95 });
  expect(between(95, 96).some(event => event.voice === 'pad' && event.length > 1.5)).toBe(true);
});
