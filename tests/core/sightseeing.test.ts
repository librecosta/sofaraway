import { expect, test } from 'vitest';
import { branchLayout, BRANCH_SPACING, REJOIN_BEAT, routeSides, SPLIT_BEAT } from '../../app/game/core/branches';
import { FixedStepClock, STEP } from '../../app/game/core/clock';
import { lanePoint, SECTION } from '../../app/game/core/collision';
import { idleInput } from '../../app/game/core/input';
import { PICKUP_BEAT, pickupForSeed } from '../../app/game/core/pickups';
import { corridorLength, Simulation, START_DISTANCE } from '../../app/game/core/simulation';
import type { RunGate } from '../../app/game/core/simulation';
import { sectionAt, VOLUMES } from '../../app/game/core/volumes';
import { buildPath } from '../../app/game/graphics/path';

const elsewhere = VOLUMES[0];
const chartOf = (sim: Simulation): RunGate[] => Reflect.get(sim, 'chart');
const gateKey = ({ beat, kind, axis, open }: RunGate) => [beat, kind, axis, open].join(':');
const axis = (distance: number) => Math.abs(distance) < 0.052 ? 0 : Math.sign(distance);
const cases = [
  { volume: elsewhere, side: 'center', seed: 0, count: 48 },
  { volume: elsewhere, side: 'right', seed: 0, count: 49 },
  { volume: elsewhere, side: 'left', seed: 0, count: 53 },
  { volume: elsewhere, side: 'left', seed: 1, count: 49 },
  { volume: elsewhere, side: 'right', seed: 1, count: 53 },
  { volume: VOLUMES[1], side: 'center', seed: 0, count: 13 },
  { volume: VOLUMES[2], side: 'center', seed: 0, count: 53 },
  { volume: VOLUMES[3], side: 'center', seed: 0, count: 31 },
] as const;

test.each(cases)('$volume.id $side seed $seed keeps authored gates reachable with real steering', ({ volume, side, seed, count }) => {
  const sim = new Simulation(volume);
  const standard = new Simulation(volume);
  const retry = new Simulation(volume);
  sim.start('hard', seed, undefined, 'sightseeing');
  standard.start('normal', seed);
  retry.start('easy', seed, undefined, 'sightseeing');
  const route = volume === elsewhere ? branchLayout(seed)[side] : undefined;
  const common = chartOf(sim).slice();
  expect(common.map(gateKey)).toEqual(chartOf(retry).map(gateKey));
  const full = [...chartOf(standard), ...(route ? standard.branchGates![route] : [])];
  const chart = [...common, ...(route ? sim.branchGates![route] : [])].sort((a, b) => a.beat - b.beat);
  expect(chart).toHaveLength(count);
  expect(chart.every(gate => full.some(authored => gateKey(gate) === gateKey(authored)))).toBe(true);
  expect(new Set(chart.map(gate => sectionAt(volume, gate.beat)?.name)))
    .toEqual(new Set(full.map(gate => sectionAt(volume, gate.beat)?.name)));
  expect(Math.min(...chart.slice(1).map((gate, i) => gate.beat - chart[i].beat))).toBeGreaterThanOrEqual(3);
  expect(sim.lives).toBe(5);

  const ticks = Math.ceil((volume.beats * sim.secondsPerBeat + 0.8) / STEP);
  let previousCrossing = -Infinity;
  for (let i = 0; i < ticks; i++) {
    const before = sim.gatesJudged;
    const next = chart[before];
    const previous = chart[before - 1];
    let input = idleInput;
    if (next && sim.time - previousCrossing >= 0.15 - 1e-9) {
      const [x, y] = sim.branch && !sim.branch.side && next.beat >= SPLIT_BEAT
        ? [side === 'left' ? -3.2 : side === 'right' ? 3.2 : 0, 0] : lanePoint(next.kind, next.open, next.axis);
      input = { ...idleInput, axisX: axis(x - sim.camera.tx), axisY: axis(y - sim.camera.ty) };
    }
    sim.step(STEP, input);
    if (sim.gatesJudged !== before) {
      previousCrossing = chartOf(sim)[before].crossedAt!;
      expect(sim.gatesPassed, `${previous?.beat} → ${next.beat}`).toBe(before + 1);
    }
  }
  expect(sim.phase).toBe('results');
  expect(sim.result).toMatchObject({ title: 'ESCAPED', accuracy: 1 });
  expect(sim.route).toBe(route ?? null);
  expect([sim.beat, sim.gatesTotal, sim.gatesPassed, sim.lives]).toEqual([volume.beats, count, count, 5]);
  sim.returnToMenu();
  sim.start('normal', seed);
  expect(chartOf(sim).map(gateKey)).toEqual(chartOf(standard).map(gateKey));
});

test.each(cases)('$volume.id $side seed $seed follows exactly one third of the full reference pace', ({ volume, side, seed }) => {
  const flags = { align: true, branchSide: side };
  const standard = new Simulation(volume, flags);
  const tour = new Simulation(volume, flags);
  standard.start('normal', seed);
  tour.start('hard', seed, undefined, 'sightseeing');
  expect(tour.speed).toBe(8);
  let speedError = 0, trackError = 0;
  for (let tick = 0; standard.phase === 'playing' && tour.phase === 'playing'; tick++) {
    const input = { ...idleInput, boosting: tick % 1440 < 720 };
    standard.step(STEP, input);
    tour.step(STEP, input);
    speedError = Math.max(speedError, Math.abs(tour.speed - standard.speed / 3));
    trackError = Math.max(trackError, Math.abs(tour.distance - START_DISTANCE - (standard.distance - START_DISTANCE) / 3));
  }
  expect(speedError).toBeLessThan(1e-8);
  expect(trackError).toBeLessThan(1e-7);
  expect(tour.beat).toBe(standard.beat);
  expect(tour.beat * tour.secondsPerBeat).toBeCloseTo(volume.beats * 60 / volume.bpm, 10);
  expect(standard.gatesPassed).toBe(standard.gatesTotal);
});

test('fixed-step sightseeing gives the same state from 20 to 144 Hz', () => {
  const run = (hz: number) => {
    const sim = new Simulation(elsewhere, { align: true, branchSide: 'right' });
    const clock = new FixedStepClock();
    sim.start('normal', 0, undefined, 'sightseeing');
    for (let frame = 1; frame <= hz * 211; frame++) {
      clock.consume(frame / hz, () => sim.step(STEP, { ...idleInput, boosting: sim.beat > 318 && sim.beat < 348 }));
    }
    return [sim.result, sim.branch, sim.time, sim.trackDistance, sim.gatesPassed, sim.score];
  };
  const reference = run(60);
  for (const hz of [20, 120, 144]) expect(run(hz)).toEqual(reference);
});

test('missing gates costs all five lives and terminates sightseeing', () => {
  const sim = new Simulation(elsewhere);
  sim.start('easy', 0, undefined, 'sightseeing');
  for (let tick = 0; tick < 60 * 211 && sim.phase !== 'results'; tick++) sim.step(STEP, idleInput);
  expect(sim.result?.title).toBe('TERMINATED');
  expect([sim.hits, sim.lives, sim.maxLives]).toEqual([5, 0, 5]);
});

test('keyboard, pointer and touch move the camera identically in both modes', () => {
  const standard = new Simulation(elsewhere);
  const sightseeing = new Simulation(elsewhere);
  standard.start('normal');
  sightseeing.start('normal', 0, undefined, 'sightseeing');
  for (const input of [
    { ...idleInput, axisX: 1, axisY: -1 },
    { ...idleInput, target: [1, 1] as [number, number] },
    { ...idleInput, dragX: -0.003, dragY: 0.002 },
  ]) {
    for (let i = 0; i < 10; i++) {
      standard.step(STEP, input);
      sightseeing.step(STEP, input);
    }
    expect(sightseeing.camera).toEqual(standard.camera);
  }
});

test.each(['cruise', 'boost', 'toggle'] as const)('%s keeps sightseers on a continuous and separated branch', pace => {
  const base = buildPath(corridorLength(elsewhere));
  const sim = new Simulation(elsewhere, { align: true, branchSide: 'right' }, base);
  sim.start('normal', 0, undefined, 'sightseeing');
  const path = sim.junctionPath!;
  let previous = base.sample(sim.distance);
  let travel = 0, turn = 0;
  while (sim.beat < 356 && sim.phase === 'playing') {
    const boosting = pace === 'boost' || (pace === 'toggle' && sim.trackDistance >= path.split && sim.trackDistance < path.end);
    sim.step(STEP, { ...idleInput, boosting });
    const camera = path.sample(sim.trackDistance, sim.branch?.side ?? 'center');
    travel = Math.max(travel, camera.p.distanceTo(previous.p));
    turn = Math.max(turn, camera.f.angleTo(previous.f));
    previous = camera;
    if (sim.branch?.side && sim.trackDistance < path.end) {
      expect(sim.distance).toBeCloseTo(path.arcAt(sim.trackDistance, sim.branch.side), 8);
      for (const gate of sim.branchGates![sim.route!]) expect(gate.routeStation).toBeCloseTo(path.arcAt(gate.worldStation, sim.branch.side), 8);
    }
  }
  expect(travel).toBeLessThan(0.5);
  expect(turn).toBeLessThan(0.05);
  for (const beat of [path!.openBeat, 330, path!.mergeBeat]) {
    const distance = path!.distanceAt(beat);
    const center = path!.sample(distance, 'center');
    for (const side of routeSides.filter(side => side !== 'center')) {
      const offset = path!.sample(distance, side).p.distanceTo(center.p);
      expect(offset).toBeCloseTo(BRANCH_SPACING, 8);
      expect(offset - SECTION.a * 2).toBeGreaterThan(2);
    }
  }
  expect(sim.trackDistance).toBeGreaterThan(path.end);
  expect(path!.sample(path!.end, 'right').p.distanceTo(base.sample(path!.end).p)).toBe(0);
});

test.each(['shield', 'resonance', 'lumen'] as const)('%s can be collected in sightseeing under both layouts', kind => {
  for (const side of ['left', 'right'] as const) {
    const seed = Array.from({ length: 50 }, (_, i) => i).find(seed => pickupForSeed(seed) === kind && branchLayout(seed)[side] === 'challenge')!;
    const flags = { align: true };
    const sim = new Simulation(elsewhere, flags);
    sim.start('hard', seed, undefined, 'sightseeing');
    expect(sim.branch?.layout[side]).toBe('challenge');
    const before = chartOf(sim).filter(gate => gate.beat < PICKUP_BEAT).at(-1)!;
    const after = chartOf(sim).find(gate => gate.beat > PICKUP_BEAT)!;
    while (sim.beat < before.beat) sim.step(STEP, idleInput);
    expect(sim.gatesPassed).toBe(sim.gatesJudged);
    flags.align = false;
    expect(Math.min(PICKUP_BEAT - before.beat, after.beat - PICKUP_BEAT) * sim.secondsPerBeat * sim.speed).toBeGreaterThan(8);
    const { score, distance } = sim;
    while (sim.beat < PICKUP_BEAT) sim.step(STEP, { ...idleInput, target: [0, 1] });
    expect(sim.pickup).toEqual({ kind, status: 'collected' });
    expect(sim.shield).toBe(kind === 'shield');
    expect(sim.resonance).toBe(kind === 'resonance' ? 8 : 0);
    expect(sim.score - score - (sim.distance - distance) * 0.35).toBeCloseTo(kind === 'lumen' ? 5000 : 0, 7);
    if (kind === 'shield') {
      const outside = after.kind === 'iris' ? 0 : 2.8;
      const judged = sim.gatesJudged;
      while (sim.gatesJudged === judged) sim.step(STEP, { ...idleInput, target: [outside, 0] });
      expect(sim.shield).toBe(false);
      expect(sim.lives).toBe(5);
      expect(sim.gatesPassed).toBe(judged);
    }
    if (kind === 'resonance') {
      flags.align = true;
      while (sim.gatesJudged < 1 + chartOf(sim).indexOf(after)) sim.step(STEP, idleInput);
      expect(sim.resonance).toBe(7);
    }
  }
});
