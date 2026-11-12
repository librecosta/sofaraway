import { expect, test } from 'vitest';
import { beatPulse, breath, ceilingLight, colorScore, hueDistance, lightBeat, lightCues,
  lightingState, mixHue, scoreHue } from '../../app/game/core/lighting-score';
import { Simulation } from '../../app/game/core/simulation';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { volumeById } from '../../app/game/core/volumes';

test('the pulse is smooth at the beat and the four- and eight-beat breaths are continuous', () => {
  expect(lightBeat(15, 128)).toBe(32);
  expect(lightBeat(15, 120)).toBe(30);
  expect(beatPulse(8)).toBe(1);
  expect(beatPulse(8.5)).toBeLessThan(.0001);
  expect(beatPulse(8 - .012)).toBeCloseTo(beatPulse(8 + .012), 12);
  expect(beatPulse(80 - 1e-6)).toBeCloseTo(beatPulse(80 + 1e-6), 12);
  for (const period of [4, 8] as const) {
    expect(breath(0, period)).toBe(0);
    expect(breath(period / 2, period)).toBe(1);
    expect(breath(period + 2.35, period)).toBeCloseTo(breath(2.35, period), 10);
  }
  for (const cue of lightCues.slice(1)) {
    expect(lightingState(cue.start - 1e-7).rim).toBeCloseTo(lightingState(cue.start + 1e-7).rim, 6);
  }
  const relativePulse = (beat: number) => lightingState(beat).rim - lightingState(beat + .5).rim;
  expect(relativePulse(202)).toBeGreaterThan(relativePulse(8) * 3);
  expect(lightingState(202, true).pulse).toBe(0);
  expect(lightingState(202, true).rim).toBe(lightingState(8.3, true).rim);
});

test('authored hue cues hold the six anchors and follow the short circular arc', () => {
  expect(colorScore.length).toBeGreaterThan(Math.ceil(448 / 32) * 2);
  for (const anchor of [.44, .78, .92, .57, .09, .66]) expect(colorScore.some(c => c.hue === anchor)).toBe(true);
  expect(hueDistance(.92, .04)).toBeCloseTo(.12, 12);
  expect(mixHue(.92, .04, .5)).toBeCloseTo(.98, 12);
  expect(scoreHue(200)).toBeCloseTo(.98, 12);
  for (const { beat, hue, transitionBeats } of colorScore.slice(1)) {
    expect(Math.abs(hueDistance(scoreHue(beat), hue))).toBeLessThan(1e-8);
    for (const edge of [beat - transitionBeats, beat]) {
      expect(Math.abs(hueDistance(scoreHue(edge - 1e-5), scoreHue(edge + 1e-5)))).toBeLessThan(1e-7);
    }
  }
});

test('ordered lamps share hue in game, travel in phase and limit the alternative tint to one group', () => {
  const state = lightingState(174);
  const a = ceilingLight(state, 6300, 0, true);
  const b = ceilingLight(state, 6300, 1, true);
  expect(a.hue).toBe(b.hue);
  expect(a.level).not.toBe(b.level);
  expect(ceilingLight(lightingState(178), 6300, 0, true).level).toBeCloseTo(a.level, 8);
  expect(ceilingLight(state, 6348, 0, true).level).toBeCloseTo(a.level, 8);
  expect(ceilingLight(state, 6300, 0, true, true)).toEqual(a);
  expect(ceilingLight(state, 6300, 1, false, true)).toEqual(ceilingLight(state, 6300, 1, false));
  expect(Math.abs(hueDistance(ceilingLight(state, 6300, 1, true, true).hue, a.hue))).toBeLessThan(.061);
  expect(ceilingLight(lightingState(174, true), 6300, 1, true, true))
    .toEqual(ceilingLight(lightingState(174, true), 6300, 0, true));
});

test('the silent fixed-step timeline freezes the cue phase and Boost only changes the station', () => {
  const volume = volumeById('elsewhere');
  const cruise = new Simulation(volume, { align: true }), boost = new Simulation(volume, { align: true });
  cruise.start('normal', 7); boost.start('normal', 18);
  for (let i = 0; i < 600; i++) {
    cruise.step(STEP, idleInput); boost.step(STEP, { ...idleInput, boosting: true });
  }
  expect(boost.trackDistance).toBeGreaterThan(cruise.trackDistance + 50);
  expect(lightingState(boost.beat)).toEqual(lightingState(cruise.beat));
  const frozen = lightingState(cruise.beat);
  expect(lightingState(cruise.beat)).toEqual(frozen);
  cruise.step(STEP, idleInput);
  expect(lightingState(cruise.beat).pulse).not.toBe(frozen.pulse);
  expect(cruise.beat).toBeCloseTo(lightBeat(cruise.time, volume.bpm), 8);
});
