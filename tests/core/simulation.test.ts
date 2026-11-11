import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { chartFor } from '../../app/game/core/chart';
import { FixedStepClock, STEP } from '../../app/game/core/clock';
import { canPass, lanePoint, opening } from '../../app/game/core/collision';
import { idleInput } from '../../app/game/core/input';
import { corridorLength, Simulation } from '../../app/game/core/simulation';
import { sectionAt, VOLUMES } from '../../app/game/core/volumes';

// Digests of the full {beat, sector, section} arrays at dev@88a4adb.
const baselines = [
  [143, 144, 144, '8eec49a9d209522f2a4ef00e78973486e46a677315eb0eb0a0f63a2b05265eda', 'a9a1d88caf0fdaea8b23f5d82f6f003fb4164e03b27a5008a56a28955ff40461', 'c8d761bb72e16f4cf5b7d222208c339a25fc24ba70c6376afb6d14def874dd2b'],
  [40, 40, 40, '1e4fd50b6d37ac4f4da5bed817ddd6c250cd50884cf5e7c2317a34414ea459e8', 'a200391b07abd95d21388ad7a74f55a1c03cc50099727581069bd5b0c7fc4a75', '497c8fc0db31844fb7417efb7b65ba4ac3d89d10c6bf5675c07e3090bb0d29bc'],
  [158, 158, 158, '5b9c3f25d8578a8fa2897c5e1000ef759a6c6841d4c34438018096d6c39cf243', '8d8ea760a966f135ce8d5e84b68be7acc6d325155b0d212839b18390bcb02861', '3cd161c256eaedeb562cb49401b40443fc50fb1a7097eb7691e00ec2e33a7a1c'],
  [91, 91, 91, '1656fd948fb18dba9a0778ed474ea10e317cd2b76cdfe10ba51a853651cf9d6f', '58a13f3067bc9e72240aa74833148b8444c413209ab60aacea47a4fb132d3067', 'dbc73ec5d41739182d095c75e269e542e7bf45711cdc58fc72f0f09c9a71f4c5'],
] as const;

describe.each(VOLUMES.map((volume, index) => ({ volume, baseline: baselines[index] })))('$volume.id', ({ volume, baseline }) => {
  test.each(difficulties)('%s chart and a full run with collision enabled', difficulty => {
    const i = difficulties.indexOf(difficulty);
    const chart = chartFor(volume, difficulty);
    const [easy, normal, hard] = baseline;
    expect(chart).toHaveLength([easy, normal, hard][i]);
    const originalFields = chart.map(({ beat, sector, section }) => ({ beat, sector, section }));
    expect(createHash('sha256').update(JSON.stringify(originalFields)).digest('hex')).toBe(baseline[3 + i]);
    if (volume.id !== 'elsewhere') expect(new Set(chart.map(gate => gate.kind))).toEqual(new Set([volume.obstacle]));
    for (const gate of chart) expect(sectionAt(volume, gate.beat)?.name).toBe(gate.section);
    const sim = new Simulation(volume, { align: true });
    sim.start(difficulty);
    const frames = Math.ceil((volume.beats * sim.secondsPerBeat + 0.8) / STEP);
    for (let n = 0; n < frames; n++) sim.step(STEP, idleInput);
    expect(sim.phase).toBe('results');
    const count = volume.id === 'elsewhere' ? chart.length - 3 : chart.length;
    expect([sim.gatesPassed, sim.gatesJudged, sim.maxCombo, sim.hits, sim.lives]).toEqual([
      count, count, count, 0, volume.lives[difficulty],
    ]);
    expect(sim.result).toEqual({ title: 'ESCAPED', accuracy: 1, rank: 'S',
      ...(volume.id === 'elsewhere' ? { route: 'main' } : {}) });
    expect(sim.distance + 420).toBeLessThan(corridorLength(volume));
  });
});

test('point collision respects all four opening shapes', () => {
  expect(canPass('iris', 0, 0, 1, 0)).toBe(false);
  expect(canPass('iris', 0, 0, 1.02, 0)).toBe(true);
  expect(canPass('lattice', 5, 0, 1.26, 0)).toBe(false);
  expect(canPass('lattice', 5, 0, 1.3, 0)).toBe(true);
  expect(opening('lattice', 4)).toBe(5);
  expect(canPass('aperture', 0, 0, 1.05, 0)).toBe(false);
  expect(canPass('aperture', 0, 0, 2.15, 0.94)).toBe(true);
  expect(canPass('shutter', 2, 0, 0, 2)).toBe(true);
  expect(canPass('shutter', 2, 1, 0, 2)).toBe(false);
  expect(canPass('shutter', 2, 1, ...lanePoint('shutter', 2, 1))).toBe(true);
});

test('a hard run can terminate once, settle, and restart cleanly', () => {
  const sim = new Simulation(VOLUMES[0]);
  expect(sim.start('hard')).toBe(true);
  expect(sim.start('hard')).toBe(false);
  for (let i = 0; i < 8 / STEP; i++) sim.step(STEP, idleInput);
  expect(sim.phase).toBe('crash');
  expect(sim.hits).toBe(1);
  expect(sim.gatesJudged).toBe(1);
  expect(sim.beat).toBe(16);
  const score = sim.score;
  for (let i = 0; i < 43; i++) sim.step(STEP, idleInput);
  expect(sim.phase).toBe('results');
  expect(sim.score).toBe(score);
  expect(sim.result).toEqual({ title: 'TERMINATED', accuracy: 0, rank: 'C' });
  expect(sim.start('easy')).toBe(true);
  expect([sim.gatesJudged, sim.hits, sim.lives, sim.combo, sim.score, sim.beat]).toEqual([0, 0, 3, 0, 0, 0]);
});

test('fixed steps yield the same result at 20, 60, 120, and 144 Hz', () => {
  function run(hz: number) {
    const sim = new Simulation(VOLUMES[3], { align: true });
    const clock = new FixedStepClock();
    sim.start('hard');
    for (let frame = 1; frame <= hz * 100; frame++) {
      expect(clock.consume(frame / hz, () => {
        sim.step(STEP, { ...idleInput, boosting: clock.elapsed > 30 });
      })).toBe('ok');
    }
    return [sim.beat, sim.camera, sim.score, sim.lives, sim.gatesJudged, sim.distance];
  }
  expect(run(20)).toEqual(run(60));
  expect(run(60)).toEqual(run(120));
  expect(run(60)).toEqual(run(144));
});

test('an unsafe frame commits no steps and can resume from its last tick', () => {
  const clock = new FixedStepClock();
  const sim = new Simulation(VOLUMES[0]);
  sim.start('hard');
  const step = () => sim.step(STEP, idleInput);
  expect(clock.consume(5 * STEP, step)).toBe('ok');
  const before = [sim.beat, sim.score, sim.lives, clock.elapsed];
  expect(clock.consume(5, step)).toBe('stalled');
  expect([sim.beat, sim.score, sim.lives, clock.elapsed]).toEqual(before);
  expect(clock.consume(clock.elapsed + STEP, step)).toBe('ok');
  expect(sim.beat).toBeGreaterThan(before[0]);
});
