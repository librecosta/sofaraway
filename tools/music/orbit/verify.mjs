import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { duration, sections, tail, versions } from './score.mjs';
import { starwakeTrack } from '../../../app/game/core/orbit-score.ts';

const db = value => value > 0 ? 20 * Math.log10(value) : -180;

// Three intervening phases on a 4x grid, 32-tap windowed sinc reconstruction.
// This is a bandlimited true-peak estimate, not a hardware output measurement.
function truePeak(channels) {
  let maximum = 0;
  for (const fraction of [.25, .5, .75]) {
    const kernel = Array.from({ length: 32 }, (_, index) => {
      const x = index - 15 - fraction;
      return Math.sin(Math.PI * x) / (Math.PI * x) * (.42 + .5 * Math.cos(Math.PI * x / 16) + .08 * Math.cos(Math.PI * x / 8));
    });
    const total = kernel.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < kernel.length; i++) kernel[i] /= total;
    for (const samples of channels) for (let i = 15; i < samples.length - 16; i++) {
      let value = 0;
      for (let tap = 0; tap < 32; tap++) value += samples[i + tap - 15] * kernel[tap];
      maximum = Math.max(maximum, Math.abs(value));
    }
  }
  return maximum;
}

/** Scan every delivered PCM sample and retain section and half-second dynamics. */
export function inspectWav(bytes, track = { duration, tail, sections }) {
  const { duration, tail, sections } = track;
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(bytes.readUInt16LE(20), 1);
  assert.equal(bytes.readUInt16LE(22), 2);
  assert.equal(bytes.readUInt32LE(24), 44100);
  assert.equal(bytes.readUInt16LE(34), 16);
  const sampleRate = 44100;
  const frames = (bytes.length - 44) / 4;
  assert.equal(frames, (duration + tail) * sampleRate);
  const channels = [new Float64Array(frames), new Float64Array(frames)];
  const windows = [];
  let peak = 0, square = 0, clipped = 0, maxStep = 0, cross = 0, leftPower = 0, rightPower = 0;
  let windowPower = 0, windowFrames = 0, silentFrames = 0, maxSilence = 0, dc = 0;
  for (let i = 0; i < frames; i++) {
    let framePeak = 0;
    for (let channel = 0; channel < 2; channel++) {
      const raw = bytes.readInt16LE(44 + i * 4 + channel * 2);
      const value = raw / 32768;
      channels[channel][i] = value;
      peak = Math.max(peak, Math.abs(value));
      framePeak = Math.max(framePeak, Math.abs(value));
      square += value * value;
      windowPower += value * value;
      dc += value;
      if (Math.abs(raw) >= 32767) clipped++;
      if (i) maxStep = Math.max(maxStep, Math.abs(value - channels[channel][i - 1]));
    }
    cross += channels[0][i] * channels[1][i];
    leftPower += channels[0][i] ** 2;
    rightPower += channels[1][i] ** 2;
    if (i < duration * sampleRate) {
      silentFrames = framePeak < .0004 ? silentFrames + 1 : 0;
      maxSilence = Math.max(maxSilence, silentFrames);
    }
    windowFrames++;
    if (windowFrames === sampleRate / 2) {
      windows.push(db(Math.sqrt(windowPower / (2 * windowFrames))));
      windowFrames = windowPower = 0;
    }
  }
  assert.equal(clipped, 0);
  assert.ok(peak > .15 && peak < .90, 'Master needs signal and peak headroom');
  assert.ok(maxSilence < sampleRate * 1.2, 'Unexpected sustained silence in the body');
  assert.equal(bytes.readInt32LE(bytes.length - 4), 0, 'Tail must reach zero');
  const oversampled = Math.max(peak, truePeak(channels));
  assert.ok(oversampled < .95, 'Inter-sample peak has insufficient headroom');
  const sectionLevels = sections.map(section => {
    let power = 0, sectionPeak = 0;
    const from = Math.round(section.start * sampleRate), until = Math.round(section.end * sampleRate);
    for (const samples of channels) for (let i = from; i < until; i++) {
      power += samples[i] ** 2;
      sectionPeak = Math.max(sectionPeak, Math.abs(samples[i]));
    }
    return { name: section.name, rmsDbfs: db(Math.sqrt(power / (2 * (until - from)))), peakDbfs: db(sectionPeak) };
  });
  const eclipse = sectionLevels.find(section => section.name === 'ECLIPSE');
  const aurora = sectionLevels.find(section => section.name === 'AURORA');
  assert.ok(aurora.rmsDbfs > eclipse.rmsDbfs + 3, 'ECLIPSE must make room for AURORA');
  return { seconds: frames / sampleRate, sampleRate, channels: 2, bits: 16,
    peakDbfs: db(peak), truePeakDbtpEstimate: db(oversampled), rmsDbfs: db(Math.sqrt(square / (2 * frames))),
    clipped, nonFinite: 0, maxSampleStep: maxStep, dc: dc / (frames * 2),
    longestQuietBodySeconds: maxSilence / sampleRate, stereoCorrelation: cross / Math.sqrt(leftPower * rightPower),
    sectionLevels, halfSecondRmsDbfs: windows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { prototypes: { type: 'boolean' } } });
  for (const filename of values.prototypes ? Object.values(versions) : ['ORBIT-STARWAKE-FULL']) {
    const file = new URL('../../../scratch/orbit-m0/exports/' + filename + '.wav', import.meta.url);
    console.log(JSON.stringify({ file: file.pathname,
      ...inspectWav(await readFile(file), values.prototypes ? undefined : starwakeTrack) }));
  }
}
