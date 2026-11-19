import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bars, bpm, duration, eventSteps, makeScore, progressions, sections, themes } from './score.mjs';

const range = (events, start, end) => events.filter(({ bar }) => bar >= start && bar < end);

test('both 48-bar scores expose deterministic fractional events and seven contiguous sections', () => {
  assert.equal(bpm, 128);
  assert.equal(bars, 48);
  assert.equal(duration, 90);
  assert.deepEqual(sections.map(({ startBar, endBar }) => [startBar, endBar]),
    [[0, 4], [4, 12], [12, 20], [20, 28], [28, 32], [32, 40], [40, 48]]);
  for (const version of ['A', 'B']) {
    const events = makeScore(version);
    assert.deepEqual(events, makeScore(version));
    assert.equal(progressions[version].flatMap(row => row.split(' ')).length, bars);
    assert.ok(events.every((event, i) => event.id === i && event.at >= (events[i - 1]?.at ?? 0)
      && event.at < duration && event.velocity > 0 && event.velocity <= 1));
    assert.deepEqual(eventSteps(events).flat().sort((a, b) => a - b), events.map(event => event.id));
    assert.ok(events.some(({ beat }) => beat * 4 !== Math.trunc(beat * 4)));
  }
  assert.throws(() => makeScore('C'), RangeError);
});

test('GRAVITY breaks the grid while STARWAKE carries a distinct sustained theme and grounded kicks', () => {
  const a = makeScore('A'), b = makeScore('B');
  const share = events => {
    const hits = events.filter(({ voice }) => voice === 'kick');
    return hits.filter(({ beat }) => Number.isInteger(beat)).length / hits.length;
  };
  assert.ok(share(b) > share(a) + .24);
  assert.notDeepEqual(themes.A, themes.B);
  const leadLength = events => events.filter(({ voice }) => voice === 'lead').reduce((sum, event) => sum + event.length, 0);
  assert.ok(leadLength(b) > leadLength(a) * 1.3);
  assert.ok(a.filter(({ ghost }) => ghost).length > b.filter(({ ghost }) => ghost).length * 2);
});

test('themes return, ECLIPSE suspends the rhythm and APHELION ends with a resolved coda', () => {
  for (const version of ['A', 'B']) {
    const events = makeScore(version);
    const eclipse = range(events, 28, 32);
    assert.equal(eclipse.filter(({ voice }) => voice === 'snare').length, 0);
    assert.equal(eclipse.filter(({ voice }) => voice === 'bass').length, 1);
    assert.ok(eclipse.some(({ voice }) => voice === 'pluck'));
    assert.ok(range(events, 32, 40).filter(({ voice }) => voice === 'lead').length >= 16);
    const first = range(events, 12, 16).filter(({ voice }) => voice === 'lead');
    const returnTheme = range(events, 32, 36).filter(({ voice }) => voice === 'lead');
    assert.deepEqual(first.map(event => event.note), returnTheme.map(event => event.note));
    assert.ok(returnTheme[0].length > first[0].length);
    assert.equal(range(events, 47, 48).filter(({ voice }) => ['kick', 'snare', 'bass'].includes(voice)).length, 0);
    assert.equal(events.filter(({ voice }) => voice === 'lead').at(-1).note, version === 'A' ? 74 : 65);
    const phrases = [];
    for (let bar = 4; bar < 28; bar += 4) phrases.push(JSON.stringify(range(events, bar, bar + 4)
      .filter(({ voice }) => ['kick', 'snare', 'hat'].includes(voice))
      .map(({ voice, beat, velocity }) => [voice, beat - bar * 4, velocity])));
    assert.equal(new Set(phrases).size, phrases.length);
  }
});
