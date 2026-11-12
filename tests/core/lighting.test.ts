import { expect, test } from 'vitest';
import { fixtureLevel, lightBeat, lightCues, lightFamilies, lightingState, lightPatterns,
  palette, patternStrength, tunnelBreath, warmWeight } from '../../app/game/core/lighting-score';
import { linearSwatch } from '../../app/game/graphics/scenic-lighting.client';
import { ColorManagement } from 'three';
import { makeScenicPlan } from '../../app/game/core/scenic-plan';
import { buildPath } from '../../app/game/graphics/path';
import { corridorLength, Simulation } from '../../app/game/core/simulation';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { volumeById } from '../../app/game/core/volumes';

test('the score uses absolute beats, with continuous breath, beat, alternate and chase phase', () => {
  expect(lightBeat(15, 128)).toBe(32);
  expect(lightBeat(15, 120)).toBe(30);
  for (const [pattern, period] of [['breath', 8], ['beat', 1], ['alternate', 4], ['chase', 4]] as const) {
    const sample = (beat: number, station = 4567) => patternStrength(pattern, beat, station, 3);
    expect(sample(77.34)).toBeCloseTo(sample(77.34 + period), 10);
    expect(Math.abs(sample(80 - 1e-6) - sample(80 + 1e-6))).toBeLessThan(.00002);
  }
  expect(patternStrength('alternate', 0, 4500, 0)).toBe(1);
  expect(patternStrength('alternate', 0, 4500, 1)).toBe(0);
  expect(patternStrength('chase', 4, 4238, 0)).toBe(patternStrength('chase', 4, 4200, 0));
  expect(patternStrength('chase', 4, 4219, 0)).toBeLessThan(patternStrength('chase', 4, 4200, 0));
  expect([0, 1, 2, 3, 4].map(beat => tunnelBreath(beat))).toEqual([0, expect.closeTo(.5, 8), 1, expect.closeTo(.5, 8), 0]);
  expect(tunnelBreath(2, true)).toBe(tunnelBreath(0, true));
});

test('chapter boundaries and blackout are continuous; fill and direction markers never turn off', () => {
  for (const cue of lightCues.slice(1)) for (const family of lightFamilies) {
    expect(fixtureLevel(lightingState(cue.start - 1e-7), family, 6167, 3))
      .toBeCloseTo(fixtureLevel(lightingState(cue.start + 1e-7), family, 6167, 3), 5);
  }
  const black = lightingState(193), bright = lightingState(193, 'all-on');
  expect(black.blackout).toBe(1);
  expect(fixtureLevel(black, 'rhythm', 6000, 1)).toBeLessThan(.1);
  expect(fixtureLevel(bright, 'rhythm', 6000, 1)).toBeGreaterThan(.4);
  expect(fixtureLevel(black, 'fill', 6000, 1)).toBeGreaterThan(.45);
  expect(fixtureLevel(black, 'gate-adjacent', 6000, 1)).toBeGreaterThan(.28);
  expect(fixtureLevel(black, 'rhythm', 6000, 1, true)).toBeGreaterThan(.1);
  for (const pattern of lightPatterns) for (const family of lightFamilies) {
    for (const beat of [0, 28.33, 164.5, 193.1, 300.51, 444]) {
      const level = fixtureLevel(lightingState(beat, pattern), family, 6012, 42);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(.74);
    }
  }
});

test('dual-color weights are bounded, complementary and decoded independently of global color settings', () => {
  for (const beat of [0, 2, 4, 6, 8, 2.23]) {
    const warm = warmWeight(beat, 2, true), cool = warmWeight(beat, 3, true);
    expect(warm + cool).toBeCloseTo(1, 12);
    expect(warm).toBeGreaterThanOrEqual(0);
    expect(warm).toBeLessThanOrEqual(1);
  }
  expect(warmWeight(2, 2, true)).toBeGreaterThan(warmWeight(6, 2, true));
  const setting = ColorManagement.enabled;
  try {
    ColorManagement.enabled = false;
    const expected = linearSwatch(palette.amber);
    ColorManagement.enabled = true;
    expect(linearSwatch(palette.amber).toArray()).toEqual(expected.toArray());
    expect(linearSwatch('#808080').r).toBeCloseTo(.216, 3);
  } finally { ColorManagement.enabled = setting; }
});

test('the silent fixed-step timeline can freeze, resume and Boost without moving authored lamps', () => {
  const volume = volumeById('elsewhere');
  const cruise = new Simulation(volume, { align: true }), boost = new Simulation(volume, { align: true });
  cruise.start('normal', 7); boost.start('normal', 18);
  const path = buildPath(corridorLength(volume), 150, 46, volume.topology);
  const plan = makeScenicPlan(volume, path);
  for (let i = 0; i < 600; i++) {
    cruise.step(STEP, idleInput); boost.step(STEP, { ...idleInput, boosting: true });
  }
  expect(boost.trackDistance).toBeGreaterThan(cruise.trackDistance + 50);
  expect(boost.beat).toBe(cruise.beat);
  expect(makeScenicPlan(volume, path)).toEqual(plan);
  const lamp = plan.lamps[0];
  const read = () => fixtureLevel(lightingState(cruise.beat, 'chase'), lamp.family, lamp.station, lamp.group);
  const frozen = read();
  expect(read()).toBe(frozen);
  cruise.step(STEP, idleInput);
  expect(read()).not.toBe(frozen);
  expect(cruise.beat).toBeCloseTo(lightBeat(cruise.time, volume.bpm), 8);
});
