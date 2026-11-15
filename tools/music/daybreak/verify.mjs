// Run after export.mjs to check the score and production PCM.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bpm, duration, rhythmTimeline, score, sections, tail } from './score.mjs';

assert.equal(bpm, 120);
assert.equal(score.length, 72);
assert.equal(duration, 144);
assert.deepEqual(sections.map(section => section.start), [0, 8, 40, 64, 80, 112, 136]);
assert.equal(rhythmTimeline().at(-1).time, 140.766);
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
// The GLASSHOUSE outro carries the pad and the last mallet note through the
// final bar, so the old "silent last bar" assumption no longer applies. The
// export gain still has to close the two-second tail.
let outroPeak = 0;
for (const sample of samples.subarray((duration - 2) * rate * 2)) outroPeak = Math.max(outroPeak, Math.abs(sample));
assert.ok(outroPeak > 500, 'the outro must carry the glasshouse pad and lead');
assert.equal(samples.at(-1), 0, 'the export tail must close at the final sample');
const db = value => 20 * Math.log10(value / 32768);
console.log(JSON.stringify({ duration: duration + tail, peakDbfs: db(peak), rmsDbfs: db(Math.sqrt(power / samples.length)),
  outroPeakDbfs: db(outroPeak) }));
