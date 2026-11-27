import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeScore, step } from './score.mjs';
import { controlTrack, makeFullScore } from '../../../app/game/core/descent-score.ts';

const score = makeFullScore();
const { duration, sections } = controlTrack;
const barLength = 16 * step;
const range = (start, end) => score.filter(({ at }) => at >= start * barLength - 1e-8 && at < end * barLength - 1e-8);
const count = (events, voice) => events.filter(event => event.voice === voice).length;

test('the frozen CONTROL timeline includes seven sections at 136 BPM and a 1.6 second release', () => {
  assert.equal(controlTrack.id, 'control');
  assert.equal(controlTrack.title, 'DESCENT — CONTROL');
  assert.equal(controlTrack.bpm, 136);
  assert.equal(controlTrack.beatsPerBar, 4);
  assert.equal(controlTrack.bars, 96);
  assert.equal(controlTrack.beats, 384);
  assert.equal(controlTrack.tail, 1.6);
  assert.equal(duration, 384 * 60 / 136);
  assert.deepEqual(sections.map(({ name, startBeat, endBeat }) => [name, startBeat, endBeat]), [
    ['ORDER', 0, 32], ['LOCK', 32, 96], ['FLIGHT', 96, 176], ['PRESSURE', 176, 256],
    ['HOLD', 256, 288], ['LOCKDOWN', 288, 352], ['BREACH', 352, 384],
  ]);
  assert.deepEqual(score, makeFullScore());
  assert.ok(score.every(({ at, velocity }, i) => at >= (score[i - 1]?.at ?? 0) && at < duration
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
  assert.ok(final.some(event => event.voice === 'chord' && event.at + event.length > duration));
});
