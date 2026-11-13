import { describe, expect, it } from 'vitest';
import { approachDynamicLights, drumPulse, drumScore, drumStrengths, dynamicLightEnvelope,
  musicStepSeconds } from '../../app/game/core/rhythmic-lights';
import { RunTimeline } from '../../app/game/core/clock';
import { sectionAt, VOLUMES } from '../../app/game/core/volumes';

describe('dynamic structural lighting', () => {
  it('preserves the authored kick, snare and roll events on every score step', () => {
    for (const volume of VOLUMES) {
      for (let step = 0; step < volume.beats * 4; step++) {
        const energy = sectionAt(volume, step / 4)?.energy ?? .15;
        const s = step % 16;
        const ending = step / 4 > volume.beats - 8;
        const halfTime = volume.music === 'industrial';
        expect(drumStrengths(volume, step, energy)).toEqual({
          kick: !ending && (halfTime ? s === 0 || s === 10 : s % 4 === 0 && energy > .20) ? .55 + energy * .45 : 0,
          snare: !ending && energy > .42 && (halfTime ? s === 8 : s === 4 || s === 12) ? .5 + energy * .5 : 0,
          fill: Math.floor(step / 16) % 4 === 3 && s >= 12 && energy > .6 ? .35 + (s - 12) * .14 : 0,
        });
        expect(drumScore(volume)[step]).toEqual(drumStrengths(volume, step, energy));
      }
    }
  });

  it('keeps off and reduced motion at baseline and gives each score a bounded pulse', () => {
    for (const volume of VOLUMES) {
      let peak = 1, valley = 1;
      for (let beat = 0; beat < volume.beats; beat += 1 / 8) {
        const time = beat * 60 / volume.bpm;
        const gain = dynamicLightEnvelope(volume, time, 1);
        peak = Math.max(gain.fixtureGain, peak);
        valley = Math.min(gain.fixtureGain, valley);
        for (const [amount, reduced] of [[0, false], [1, true]] as const) {
          expect(dynamicLightEnvelope(volume, time, amount, reduced)).toMatchObject({
            fixtureGain: 1, rimGain: 1, physicalGain: 1, amount: 0 });
        }
        expect(gain.fixtureGain).toBeGreaterThanOrEqual(.30 - 1e-9);
        expect(gain.fixtureGain).toBeLessThanOrEqual(2.25);
        expect(gain.physicalGain).toBeGreaterThanOrEqual(.85);
        expect(gain.physicalGain).toBeLessThanOrEqual(1.35);
      }
      expect(peak).toBeGreaterThan(1.5);
      expect(valley).toBeLessThan(.7);
      expect(dynamicLightEnvelope(volume, (volume.beats - 1) * 60 / volume.bpm, 1).fixtureGain).toBeCloseTo(1, 2);
    }
  });

  it('responds to kick and snare onsets and leaves the break quieter than the drop', () => {
    const volume = VOLUMES[0];
    const seconds = musicStepSeconds(volume.bpm);
    const onset = 222 * 4 * seconds;
    expect(drumPulse(volume, onset)).toBe(1);
    expect(drumPulse(volume, onset + .05)).toBeCloseTo(Math.exp(-.05 / .14));
    expect(drumPulse(volume, onset + .14)).toBeCloseTo(Math.exp(-1));
    expect(drumPulse(volume, onset + .25)).toBeCloseTo(Math.exp(-.25 / .14));
    expect(drumPulse(volume, onset - .008)).toBeLessThan(.6);
    expect(drumPulse(volume, onset + 4 * seconds)).toBe(1);
    const gain = (beat: number) => dynamicLightEnvelope(volume, beat * 4 * seconds, 1).fixtureGain;
    expect(gain(8)).toBeCloseTo(.85);
    expect(gain(222) / gain(222.9375)).toBeGreaterThan(5);
    expect(gain(398) / gain(398.9375)).toBeGreaterThan(4);
    expect(gain(302) / gain(302.9375)).toBeLessThan(1.5);
    expect(gain(174)).toBeLessThan(gain(188));
    expect(gain(440)).toBeLessThan(gain(436));
    for (const beat of [16, 96, 160, 192, 288, 320, 384, 448]) {
      expect(Math.abs(gain(beat - 1e-6) - gain(beat + 1e-6))).toBeLessThan(.0001);
    }
    const industrial = VOLUMES[2];
    const snare = 456 * musicStepSeconds(industrial.bpm);
    expect(drumScore(industrial)[456].snare).toBeGreaterThan(0);
    expect(drumPulse(industrial, snare)).toBeGreaterThan(drumPulse(industrial, snare + .05));
  });

  it('samples onsets within one display interval and resumes at the same timeline phase', () => {
    const volume = VOLUMES[0], onset = 222 * 60 / volume.bpm;
    for (const hz of [60, 120, 144]) {
      for (const offset of [0, .25, .5, .75]) {
        const samples = [-2, -1, 0, 1, 2, 3].map(i => onset + (i + offset) / hz);
        const peak = samples.reduce((best, time) => drumPulse(volume, time) > drumPulse(volume, best) ? time : best);
        expect(Math.abs(peak - onset)).toBeLessThanOrEqual(1 / hz + 1e-9);
      }
    }
    const timeline = new RunTimeline();
    timeline.anchor(7, 0);
    const before = timeline.at(7 + onset + .05);
    timeline.anchor(20 - before, before);
    expect(drumPulse(volume, timeline.at(20))).toBeCloseTo(drumPulse(volume, before), 10);
    let amount = approachDynamicLights(0, true, 140);
    expect(amount).toBe(.5);
    amount = approachDynamicLights(amount, false, 70);
    expect(amount).toBe(.25);
    expect(approachDynamicLights(amount, true, 300)).toBe(1);
    expect(approachDynamicLights(amount, false, 300)).toBe(0);
  });
});
