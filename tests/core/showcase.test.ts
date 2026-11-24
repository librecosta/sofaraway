import { expect, test } from 'vitest';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import { STEP } from '../../app/game/core/clock';
import { clampSection } from '../../app/game/core/collision';
import { idleInput } from '../../app/game/core/input';
import { ShowcasePilot } from '../../app/game/core/showcase-pilot';
import { Simulation } from '../../app/game/core/simulation';
import { VOLUMES } from '../../app/game/core/volumes';

test.each(VOLUMES)('$id showcases every Impossible route with real steering and no score', volume => {
  expect(branchLayout(0).left).not.toBe(branchLayout(1).left);
  for (const seed of [0, 1]) for (const side of routeSides) {
    const route = branchLayout(seed)[side];
    const sim = new Simulation(volume);
    sim.start('impossible', seed, 'lumen', 'standard', false);
    const standard = new Simulation(volume);
    standard.start('impossible', seed, 'lumen');
    expect(sim.reference).toBe(standard.reference);
    expect(sim.speed).toBe(standard.speed);
    expect(sim.mainGates).toEqual(standard.mainGates);
    expect(sim.branchGates).toEqual(standard.branchGates);
    expect(sim.outroPlan).toEqual(standard.outroPlan);
    const pilot = new ShowcasePilot(sim, route);
    const ending = new Set();
    let cruise = 0, boost = 0, maxMotion = 0, maxAimMotion = 0;
    while (sim.phase !== 'results') {
      const previous = { ...sim.camera };
      const next = sim.mainGates[sim.gatesJudged];
      const input = pilot.input(sim);
      if (sim.phase === 'playing') {
        if (input.boosting) boost++; else cruise++;
      }
      sim.step(STEP, input);
      maxMotion = Math.max(maxMotion, Math.hypot(sim.camera.x - previous.x, sim.camera.y - previous.y));
      maxAimMotion = Math.max(maxAimMotion, Math.hypot(sim.camera.tx - previous.tx, sim.camera.ty - previous.ty));
      ending.add(sim.outroPhase);
      if (sim.hits || sim.result?.title === 'TERMINATED') throw new Error(
        `${volume.id}/${seed}/${route}: hit ${JSON.stringify(next)} at ${sim.beat}, camera ${JSON.stringify(sim.camera)}`);
      if (sim.score !== 0 || sim.encore?.bonusScore) throw new Error('A Showcase run accrued points');
      if (sim.time > volume.beats * sim.secondsPerBeat + 10) throw new Error('Showcase did not reach results');
    }
    const label = `${volume.id}/${seed}/${route}`;
    expect(sim.result, label).toMatchObject({ title: 'ESCAPED', route, accuracy: 1, unreached: 0, neutralized: 0 });
    expect(sim.branch?.side).toBe(side);
    expect(sim.gatesPassed).toBe(sim.gatesTotal);
    expect(sim.encore, label).toMatchObject({ passed: sim.outroPlan!.gates.length, missed: 0, neutralized: 0, bonusScore: 0 });
    expect(ending, label).toEqual(new Set(['main', 'transition', 'encore', 'afterglow']));
    expect(cruise).toBeGreaterThan(60);
    expect(boost).toBeGreaterThan(60);
    expect(maxMotion, label).toBeLessThan(.35);
    expect(maxAimMotion, label).toBeLessThan(.5);
    expect(clampSection(sim.camera.x, sim.camera.y, .34)).toEqual([sim.camera.x, sim.camera.y]);
  }
});

test('a Showcase replay produces the same inputs, camera, and gate outcomes on every tick', () => {
  const volume = VOLUMES.find(item => item.id === 'orbit')!;
  const run = () => {
    const sim = new Simulation(volume);
    sim.start('impossible', 314159, undefined, 'standard', false);
    return { sim, pilot: new ShowcasePilot(sim, 'score') };
  };
  const a = run(), b = run();
  while (a.sim.phase === 'playing') {
    const input = a.pilot.input(a.sim);
    const replay = b.pilot.input(b.sim);
    if (input.target![0] !== replay.target![0] || input.target![1] !== replay.target![1] || input.boosting !== replay.boosting) {
      throw new Error(`Replay diverged at beat ${a.sim.beat}`);
    }
    a.sim.step(STEP, input);
    b.sim.step(STEP, replay);
    if (a.sim.camera.x !== b.sim.camera.x || a.sim.camera.y !== b.sim.camera.y || a.sim.distance !== b.sim.distance) {
      throw new Error(`Replay motion diverged at beat ${a.sim.beat}`);
    }
  }
  expect(a.sim.result).toEqual(b.sim.result);
  expect(a.sim.result).toMatchObject({ title: 'ESCAPED', route: 'score', accuracy: 1 });
});

test('disabling points still lets an actual Impossible collision end the flight', () => {
  const sim = new Simulation(VOLUMES[0]);
  sim.start('impossible', 0, undefined, 'standard', false);
  while (sim.phase === 'playing' && sim.beat < 64) sim.step(STEP, idleInput);
  expect(sim.result?.title).toBe('TERMINATED');
  expect(sim.hits).toBe(1);
  expect(sim.lives).toBe(0);
  expect(sim.score).toBe(0);
});
