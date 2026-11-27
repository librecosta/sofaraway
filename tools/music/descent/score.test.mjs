import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bars, bpm, duration, makeScore, sections, step, versions } from './score.mjs';

const barLength = step * 16;
const inBar = (events, bar) => events.filter(({ at }) => at >= bar * barLength - 1e-8 && at < (bar + 1) * barLength - 1e-8);

test('the two scores are repeatable 48-bar arrangements on the same 136 BPM form', () => {
  assert.equal(bpm, 136);
  assert.equal(bars, 48);
  assert.equal(duration, bars * 4 * 60 / bpm);
  assert.deepEqual(sections.map(({ start }) => start), [0, 8, 16, 28, 40]);
  assert.equal(sections.flatMap(({ chords }) => chords.split(' ')).length, bars);
  for (const version of Object.keys(versions)) {
    const events = makeScore(version);
    assert.deepEqual(events, makeScore(version));
    assert.ok(events.every(({ at, velocity }, i) =>
      at >= (events[i - 1]?.at ?? 0) && at < duration && velocity > 0 && velocity <= 1));
  }
  assert.throws(() => makeScore('unknown'), RangeError);
});

test('CONTROL anchors the quarter grid and BREACH has displaced kicks and more ghost hits', () => {
  const [control, breach] = ['A', 'B'].map(makeScore);
  const quarterShare = events => {
    const kicks = events.filter(({ voice }) => voice === 'kick');
    return kicks.filter(({ at }) => Math.abs(at / (step * 4) - Math.round(at / (step * 4))) < 1e-6).length / kicks.length;
  };
  const ghosts = events => events.filter(({ voice }) => voice === 'ghost').length;
  assert.ok(quarterShare(control) > .75);
  assert.ok(quarterShare(control) - quarterShare(breach) > .30);
  assert.ok(ghosts(breach) > 2 * ghosts(control));
});

test('the score leaves space at the opening and pressure break and resolves to the low tonic', () => {
  for (const version of Object.keys(versions)) {
    const events = makeScore(version);
    assert.ok(inBar(events, 0).some(({ voice }) => voice === 'signal'));
    assert.equal(inBar(events, 0).filter(({ voice }) => voice === 'snare' || voice === 'bass').length, 0);
    assert.equal(inBar(events, 35).filter(({ voice }) => voice === 'bass').length, 0);
    assert.ok(inBar(events, 36).some(({ voice }) => voice === 'bass'));
    assert.equal(inBar(events, 47).find(({ voice }) => voice === 'bass').note, 30);
    assert.ok(events.filter(({ voice }) => voice === 'bass').every(({ note }) => note >= 28 && note <= 38));
  }
});
