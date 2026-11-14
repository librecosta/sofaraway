// Run after export.mjs --stems to verify the actual PCM mixes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { accentEvents, editions, stems } from './editions.mjs';
import { bpm, duration, rhythmTimeline, score, sections, tail } from './score.mjs';

const orderedFrame = ({bar, section, chord, keys, bass, kicks, snares, ghost, fill, hats,
  peak, drumLevel, bassLevel, keysLevel, swell}) => ({
  bar, section, chord, keys, bass, kicks, snares, ghost, fill, hats, peak, drumLevel, bassLevel, keysLevel, swell,
});
const snapshot = JSON.stringify({ sections, score: score.map(orderedFrame), rhythm: rhythmTimeline() });
// Calculated from the original backing without the mallet and upper replies.
assert.equal(createHash('sha256').update(snapshot).digest('hex'),
  '1754d9a3a68c9a3717b698415f63c7336ccd66d15b53d6fa19297d54b63a5a05');
assert.equal(bpm, 120);
assert.equal(score.length, 72);
assert.equal(duration, 144);
assert.deepEqual(sections.map(section => section.start), [0, 8, 40, 64, 80, 112, 136]);
assert.deepEqual(editions.groove.tracks, ['backing']);
assert.deepEqual(editions.accents.tracks, ['backing', 'accents']);
assert.equal(accentEvents.length, 22);
for (const { bar, at, length, notes } of accentEvents) {
  const frame = score[bar];
  assert.ok(![...frame.kicks, ...frame.snares, ...frame.ghost, ...frame.fill].includes(at));
  assert.ok(length >= .08 && length + .04 <= .18);
  assert.ok(notes.every(note => note >= 57 && note <= 69));
}

const rate = 44_100;
const output = new URL('../../../scratch/daybreak-m1/exports/', import.meta.url);
async function pcm(name) {
  const buffer = await readFile(new URL(name + '.wav', output));
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(buffer.readUInt16LE(20), 1);
  assert.equal(buffer.readUInt16LE(22), 2);
  assert.equal(buffer.readUInt32LE(24), rate);
  assert.equal(buffer.readUInt16LE(34), 16);
  assert.equal(buffer.length, 44 + (duration + tail) * rate * 4);
  assert.equal(buffer.readInt32LE(buffer.length - 4), 0);
  return new Int16Array(buffer.buffer, buffer.byteOffset + 44, (buffer.length - 44) / 2);
}

const layersByName = {};
for (const track of stems) layersByName[track] = await pcm('stem-' + track);
for (const [edition, { name, tracks }] of Object.entries(editions)) {
  const samples = await pcm(name);
  const layers = tracks.map(track => layersByName[track]);
  let errorPeak = 0, peak = 0, power = 0;
  for (let i = 0; i < samples.length; i++) {
    const expected = layers.reduce((sum, layer) => sum + layer[i], 0);
    errorPeak = Math.max(errorPeak, Math.abs(samples[i] - expected));
    peak = Math.max(peak, Math.abs(samples[i]));
    power += samples[i] ** 2;
  }
  assert.ok(errorPeak <= 5, edition + ' differs from its component stems');
  assert.ok(peak < 32767, edition + ' clips');
  console.log(JSON.stringify({ edition, peakDbfs: 20 * Math.log10(peak / 32768),
    rmsDbfs: 20 * Math.log10(Math.sqrt(power / samples.length) / 32768), residualLsb: errorPeak }));
}
