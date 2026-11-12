import { expect, test } from 'vitest';
import { difficulties, playModes } from '../../app/game/contracts';
import { routeSides } from '../../app/game/core/branches';
import { FixedStepClock, MAX_STEPS, STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import type { RunGate } from '../../app/game/core/simulation';
import { VOLUMES } from '../../app/game/core/volumes';

const gatesOf = (sim: Simulation): RunGate[] => Reflect.get(sim, 'chart');

test.each(VOLUMES)('$id keeps fixed gate stations and original duration across cruise and Boost', volume => {
  for (const mode of playModes) {
    const sides = volume.id === 'elsewhere' ? routeSides : ['center'] as const;
    for (const difficulty of difficulties) for (const side of sides) for (const seed of [0, 1]) {
      const runs = [() => false, () => true, (tick: number) => tick % 33 < 10].map(boosting => {
        const sim = new Simulation(volume, { align: true, branchSide: side });
        sim.start(difficulty, seed, undefined, mode);
        const first = gatesOf(sim)[0];
        for (let tick = 0; sim.phase === 'playing' && tick <= 60 * 240; tick++) {
          sim.step(STEP, { ...idleInput, boosting: boosting(tick) });
        }
        expect(sim.result?.title, `${mode}/${difficulty}/${side}`).toBe('ESCAPED');
        expect(sim.beat).toBe(volume.beats);
        expect(sim.result?.unreached).toBe(0);
        expect(sim.gatesPassed).toBe(sim.gatesTotal);
        return { sim, first };
      });
      const [cruise, boost, toggle] = runs;
      expect(boost.first.crossedAt!).toBeLessThan(cruise.first.crossedAt!);
      for (const run of [boost, toggle]) expect(gatesOf(run.sim).map(gate => [gate.worldStation, gate.routeStation]))
        .toEqual(gatesOf(cruise.sim).map(gate => [gate.worldStation, gate.routeStation]));
      if (difficulty === 'normal' && seed === 0) console.log('SPATIAL ' + JSON.stringify({ volume: volume.id, mode, side,
        cruise: cruise.first.crossedAt, boost: boost.first.crossedAt,
        first: cruise.first.worldStation, last: gatesOf(cruise.sim).at(-1)?.worldStation,
        result: cruise.sim.result, boosted: boost.sim.result, score: Math.floor(cruise.sim.score),
        junction: cruise.sim.junctionPath && routeSides.map(side => cruise.sim.junctionPath!.arcAt(cruise.sim.junctionPath!.end, side) - cruise.sim.junctionPath!.split),
      }));
    }
  }
});

test.each([50, 100, 160, 250, 500, 2300])('%d ms backlog drains in order within the per-frame budget', milliseconds => {
  const clock = new FixedStepClock();
  let total = 0;
  const target = milliseconds / 1000;
  for (let frame = 0; frame <= Math.ceil(target / (MAX_STEPS * STEP)); frame++) {
    let batch = 0;
    clock.consume(target, () => { batch++; total++; });
    expect(batch).toBeLessThanOrEqual(MAX_STEPS);
  }
  expect(total).toBe(Math.floor(target / STEP + 1e-7));
});

test.each(playModes)('%s Boost reaches the same pickup earlier, clear of neighboring glass', mode => {
  const results = [false, true].map(boosting => {
    const flags = { align: true };
    const sim = new Simulation(VOLUMES[0], flags);
    sim.start('normal', 0, 'lumen', mode);
    const clearance = Math.min(...gatesOf(sim).map(gate => Math.abs(gate.worldStation - sim.pickupStation)));
    expect(clearance).toBeGreaterThan(8);
    while (sim.pickup?.status === 'pending' && sim.phase === 'playing') {
      flags.align = sim.pickupStation - sim.distance > 20;
      sim.step(STEP, { ...idleInput, boosting, target: flags.align ? null : [0, 1] });
    }
    expect(sim.pickup).toEqual({ kind: 'lumen', status: 'collected' });
    return { station: sim.pickupStation, time: sim.pickupTime, clearance };
  });
  expect(results[1].station).toBe(results[0].station);
  expect(results[1].time).toBeLessThan(results[0].time);
  console.log('PICKUP_SPACE ' + JSON.stringify({ mode, cruise: results[0], boost: results[1] }));
});

test('song end leaves an unreachable station unjudged and includes it in planned accuracy', () => {
  const sim = new Simulation(VOLUMES[1], { align: true });
  sim.start('normal');
  const final = gatesOf(sim).at(-1)!;
  const station = sim.reference.station(sim.volume.beats, sim.mode) + 50;
  const unreached = { ...final, worldStation: station, routeStation: station };
  gatesOf(sim).push(unreached);
  while (sim.phase === 'playing') sim.step(STEP, idleInput);
  expect(unreached.judged).toBe(false);
  expect(sim.result).toMatchObject({ title: 'ESCAPED', planned: 41, encountered: 40, passed: 40, unreached: 1,
    neutralized: 0, accuracy: 40 / 41 });
});

test('a single step processes multiple crossings and recovery preserves Shield, Resonance and Combo', () => {
  const sim = new Simulation(VOLUMES[1]);
  sim.start('normal');
  const gates = [0.08, 0.2, 0.65].map(offset => ({
    beat: 100, worldStation: sim.distance + offset, routeStation: sim.distance + offset,
    kind: 'square', open: 0, axis: 0, hit: false, judged: false,
  } satisfies RunGate));
  Reflect.set(sim, 'chart', gates);
  sim.shield = true;
  sim.resonance = 8;
  sim.combo = 5;
  const lives = sim.lives;
  sim.step(STEP, { ...idleInput, target: [3, 0] }, true);
  expect(gates.map(gate => gate.judged)).toEqual([true, true, false]);
  expect(sim.gatesJudged).toBe(2);
  expect(sim.gatesNeutralized).toBe(2);
  expect([sim.gatesPassed, sim.lives, sim.combo, sim.shield, sim.resonance]).toEqual([0, lives, 5, true, 8]);
  expect(sim.score).toBeCloseTo(0.4 * 0.35);
  sim.step(STEP, { ...idleInput, target: [0, 0] });
  expect([sim.gatesJudged, sim.gatesPassed, sim.lives, sim.combo, sim.resonance]).toEqual([3, 1, lives, 6, 7]);
});
