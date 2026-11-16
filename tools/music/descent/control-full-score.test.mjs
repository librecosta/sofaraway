import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeScore, step } from './score.mjs';
import { fullBars, fullDuration, fullSections, makeFullScore } from './control-full-score.mjs';

const score = makeFullScore();
const barLength = 16 * step;
const range = (start, end) => score.filter(({ at }) => at >= start * barLength - 1e-8 && at < end * barLength - 1e-8);
const count = (events, voice) => events.filter(event => event.voice === voice).length;

test('the full CONTROL score has seven continuous sections on the 136 BPM grid', () => {
  assert.equal(fullBars, 96);
  assert.equal(fullDuration, 384 * 60 / 136);
  assert.deepEqual(fullSections.map(({ name, start, end }) => [name, start, end]), [
    ['ORDER', 0, 8], ['LOCK', 8, 24], ['FLIGHT', 24, 44], ['PRESSURE', 44, 64],
    ['HOLD', 64, 72], ['LOCKDOWN', 72, 88], ['BREACH', 88, 96],
  ]);
  assert.deepEqual(score, makeFullScore());
  assert.ok(score.every(({ at, velocity }, i) => at >= (score[i - 1]?.at ?? 0) && at < fullDuration
    && Math.abs(at / step - Math.round(at / step)) < 1e-8 && velocity > 0 && velocity <= 1));
});

test('ORDER quotes prototype A exactly and the later drum phrases develop its quarter-note pulse', () => {
  assert.deepEqual(range(0, 8), makeScore('A').filter(({ at }) => at < 8 * barLength));
  const phrases = [];
  for (let bar = 8; bar < 96; bar += 4) {
    const drums = range(bar, bar + 4).filter(({ voice }) => ['kick', 'snare', 'hat', 'ghost'].includes(voice));
    phrases.push(drums.map(({ at, voice }) => [Math.round(at / step) - 16 * bar, voice]));
  }
  assert.equal(new Set(phrases.map(phrase => JSON.stringify(phrase))).size, phrases.length);
  const kickSteps = score.filter(({ voice }) => voice === 'kick').map(({ at }) => Math.round(at / step));
  assert.ok(kickSteps.filter(hit => hit % 4 === 0).length / kickSteps.length > .75);
});

test('HOLD clears space, LOCKDOWN develops its attack and BREACH resolves with a natural release', () => {
  const hold = range(64, 72);
  assert.equal(count(hold, 'snare'), 0);
  assert.equal(count(hold, 'bass'), 1);
  assert.ok(count(hold, 'kick') < 8 && count(hold, 'signal') >= 6);
  assert.ok(count(range(72, 88), 'kick') / 16 > count(range(44, 64), 'kick') / 20);
  assert.ok(count(range(72, 88), 'chord') / 16 > count(range(44, 64), 'chord') / 20);
  assert.ok(count(range(92, 96), 'kick') < count(range(88, 92), 'kick'));
  const final = range(95, 96);
  assert.equal(count(final, 'snare'), 0);
  assert.equal(final.find(({ voice }) => voice === 'bass').note, 30);
  assert.deepEqual(final.filter(({ voice }) => voice === 'signal').map(({ note }) => note), [73, 68, 66]);
  assert.ok(final.some(event => event.voice === 'chord' && event.at + event.length > fullDuration));
});
