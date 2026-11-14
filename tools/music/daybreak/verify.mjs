// Run after export.mjs to check the score and production PCM.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

const samples = await pcm('DAYBREAK-Production');
let peak = 0, power = 0;
for (const sample of samples) {
  peak = Math.max(peak, Math.abs(sample));
  power += sample ** 2;
}
assert.ok(peak > 0 && peak < 32767, 'production mix must contain sound without clipping');
const db = value => 20 * Math.log10(value / 32768);
console.log(JSON.stringify({ duration: duration + tail, peakDbfs: db(peak), rmsDbfs: db(Math.sqrt(power / samples.length)) }));

const reference = await pcm('DAYBREAK-Groove-No-Chime').catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (reference) {
  let residualPower = 0, residualPeak = 0;
  for (let i = 0; i < samples.length; i++) {
    const delta = samples[i] - reference[i];
    residualPower += delta ** 2;
    residualPeak = Math.max(residualPeak, Math.abs(delta));
  }
  const residualRmsDbfs = db(Math.sqrt(residualPower / samples.length));
  assert.ok(residualRmsDbfs < -85, 'production mix diverges from the approved export');
  console.log(JSON.stringify({ residualRmsDbfs, residualPeakDbfs: db(residualPeak) }));
}
