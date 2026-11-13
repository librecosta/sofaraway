import { expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { ROUTE_GATE_MULTIPLIERS, routeSides } from '../../app/game/core/branches';
import { difficultySettings } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { lanePoint } from '../../app/game/core/collision';
import { curveCurvature } from '../../app/game/core/corridor-composition';
import { difficultiesFor } from '../../app/game/core/difficulty';
import { idleInput } from '../../app/game/core/input';
import { LUMEN_POINTS } from '../../app/game/core/pickups';
import { Simulation } from '../../app/game/core/simulation';
import { sectionAt, VOLUMES } from '../../app/game/core/volumes';

const [elsewhere] = VOLUMES;
const axis = (delta: number) => Math.abs(delta) < .052 ? 0 : Math.sign(delta);

test('Impossible preserves every Hard gate and reaches the authored density without changing reference stations', () => {
  const hard = new Simulation(elsewhere), impossible = new Simulation(elsewhere);
  hard.start('hard', 0);
  impossible.start('impossible', 0);
  const check = (anchors: typeof hard.mainGates, expanded: typeof impossible.mainGates) => {
    const byBeat = new Map(expanded.map(gate => [gate.beat, gate]));
    for (const gate of anchors) expect(byBeat.get(gate.beat)).toEqual(gate);
    for (const [index, gate] of expanded.entries()) {
      expect(gate.worldStation).toBe(impossible.reference.station(gate.beat, 'standard'));
      if (index) expect(gate.worldStation).toBeGreaterThan(expanded[index - 1].worldStation);
    }
  };
  check(hard.mainGates, impossible.mainGates);
  const routes = ['main', 'challenge', 'score'] as const;
  for (const route of routes) check(hard.branchGates![route], impossible.branchGates![route]);
  expect(routes.map(route => impossible.branchGates![route].length)).toEqual([11, 17, 24]);
  const rewards = routes.map(route => Math.round(impossible.branchGates![route].length * ROUTE_GATE_MULTIPLIERS[route] * 675 * 3.4));
  expect(rewards).toEqual([25245, 78030, 35802]);
  const main = [...impossible.mainGates, ...impossible.branchGates!.main];
  expect(elsewhere.sections.map(section => main.filter(gate => sectionAt(elsewhere, gate.beat)?.name === section.name).length))
    .toEqual([0, 23, 20, 16, 56, 6, 25, 38]);
  expect(impossible.gatesTotal).toBe(184);
  expect(impossible.outroPlan!.gates.slice(0, 24)).toEqual(hard.outroPlan!.gates);
  expect(impossible.outroPlan!.gates).toHaveLength(36);
  for (const kind of ['iris', 'square', 'diamond']) expect(impossible.outroPlan!.gates.filter(gate => gate.kind === kind)).toHaveLength(12);
  const again = new Simulation(elsewhere);
  again.start('impossible', 0);
  expect(again.outroPlan).toEqual(impossible.outroPlan);
  expect(again.mainGates).toEqual(impossible.mainGates);
  expect(again.pickup).toEqual(hard.pickup);
  expect(LUMEN_POINTS.impossible).toBe(10000);
  expect(difficultySettings(elsewhere, 'impossible')).toMatchObject({ lives: 1, mult: 3.4, speedFactor: 1.15 });
  for (const volume of VOLUMES.slice(1)) {
    const sim = new Simulation(volume);
    sim.start('impossible');
    expect(difficultiesFor(volume.id)).toEqual(difficulties);
    expect(sim.difficulty).toBe('normal');
    expect(sim.speed).toBe(24);
  }
  const tour = new Simulation(elsewhere);
  tour.start('impossible', 0, undefined, 'sightseeing');
  expect([tour.difficulty, tour.speed, tour.lives, tour.outroPlan?.gates.length]).toEqual(['normal', 8, 5, 0]);
});

test.each(['cruise', 'boost', 'mixed'] as const)('%s clears all Impossible routes with keyboard and 150 ms reaction delay', policy => {
  for (const seed of [0, 1]) for (const side of routeSides) {
    const sim = new Simulation(elsewhere);
    sim.start('impossible', seed, 'lumen');
    const plan = sim.outroPlan!;
    expect(sim.speed).toBeCloseTo(27.6, 10);
    let lastCrossing = -Infinity, encoreIndex = 0, enteredAt = 0;
    const boundaries = [160, 288, 306].map(beat => sim.reference.station(beat, 'standard'));
    while (sim.phase === 'playing') {
      const index = sim.gatesJudged;
      const next = sim.mainGates[index] ?? plan.gates[encoreIndex];
      const following = sim.mainGates[index + 1] ?? plan.gates[encoreIndex + 1];
      const choosing = !!sim.routeGuide && !sim.branch!.side;
      let [x, y] = choosing ? [side === 'left' ? -3.2 : side === 'right' ? 3.2 : 0, 0]
        : next ? lanePoint(next.kind, next.open, next.axis) : [0, 0];
      // Keep to the inside of Iris openings and use a central gate's available
      // width to set up the next Iris without crossing its collision boundary.
      if (!choosing && next?.kind === 'iris') { x *= .65; y *= .65; }
      else if (!choosing && next && following?.kind === 'iris' && (sim.branch!.side || ('beat' in following && following.beat < 320))) {
        [x, y] = lanePoint(following.kind, following.open, following.axis).map(value => value * .39);
      }
      const station = sim.trackDistance;
      const boosting = policy === 'boost' || (policy === 'mixed' && (station < boundaries[0]
        || (station > boundaries[1] && station < boundaries[2]) || station > plan.mainLastStation));
      const ready = sim.time - lastCrossing + 1e-9 >= .15;
      sim.step(STEP, { ...idleInput, boosting, axisX: ready ? axis(x - sim.camera.tx) : 0, axisY: ready ? axis(y - sim.camera.ty) : 0 });
      if (sim.gatesJudged > index) lastCrossing = next.crossedAt!;
      else if (plan.gates[encoreIndex]?.judged) lastCrossing = plan.gates[encoreIndex++].crossedAt!;
      if (!enteredAt && sim.outroPhase === 'afterglow') enteredAt = sim.time;
      if (sim.lives === 0) throw new Error(`${policy}/${seed}/${side} missed gate ${index + 1} at ${next.worldStation}`);
    }
    expect(sim.branch?.side).toBe(side);
    expect(sim.result).toMatchObject({ title: 'ESCAPED', passed: sim.gatesTotal, accuracy: 1, rank: 'S' });
    expect(sim.beat).toBe(448);
    expect(sim.speed).toBeCloseTo(policy === 'cruise' ? 39.1 : 56.695, 8);
    expect(sim.encore?.passed).toBe(sim.encore?.encountered);
    expect(sim.trackDistance + 430).toBeLessThan(sim.path.length);
    if (policy === 'boost') {
      expect(sim.encore).toMatchObject({ passed: 36, clean: 36, bonusScore: 10800 });
      expect(enteredAt).toBeLessThan(194);
      expect(plan.gates.at(-1)!.routeStation).toBe(sim.junctionPath!.arcAt(plan.gates.at(-1)!.worldStation, side));
    } else expect(sim.encore?.encountered).toBeLessThan(36);
    if (side === 'center' || policy === 'boost') console.log('IMPOSSIBLE ' + JSON.stringify({ policy, seed, route: sim.route,
      mainLastAt: sim.mainGates.at(-1)?.crossedAt, first: plan.gates[0].worldStation, last: plan.gates.at(-1)?.worldStation,
      firstAt: plan.gates[0].crossedAt, lastAt: plan.gates.at(-1)?.crossedAt, afterglow: plan.afterglowStart,
      enteredAt, finalStation: sim.trackDistance, path: sim.path.length, score: Math.floor(sim.score), encore: sim.encore }));
  }
});

test('the unchanged S-curve has predictable yaw at each speed', () => {
  const curve = new Simulation(elsewhere).path.segments.find(segment => segment.type === 's-curve')!;
  if (curve.type !== 's-curve') throw new Error('Expected S-curve');
  const peak = Math.max(...Array.from({ length: 10001 }, (_, i) => curveCurvature(i / 10000, curve.depth, curve.amplitude)));
  const rates = [34, 39.1, 56.695].map(speed => peak * speed * 180 / Math.PI);
  expect(rates[2] / rates[0]).toBeCloseTo(1.15 * 1.45);
  console.log('IMPOSSIBLE CURVE ' + JSON.stringify({ peak, rates }));
});
