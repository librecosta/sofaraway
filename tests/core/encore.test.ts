import { expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import { STEP } from '../../app/game/core/clock';
import { canPass, lanePoint } from '../../app/game/core/collision';
import { ENCORE_FIRST_OFFSET, ENCORE_MAX_SPACING, ENCORE_MIN_SPACING } from '../../app/game/core/encore';
import { idleInput } from '../../app/game/core/input';
import { lightingState } from '../../app/game/core/lighting-score';
import { pickupForSeed } from '../../app/game/core/pickups';
import { BOOST_MULTIPLIER, cruiseTarget } from '../../app/game/core/reference-track';
import { Simulation } from '../../app/game/core/simulation';
import { VOLUMES } from '../../app/game/core/volumes';
import { OutroInspection, outroView, previewResults } from '../../app/game/debug/outro-inspection';

const volume = VOLUMES[0];
const boostInput = { ...idleInput, boosting: true };

test('Encore is derived from the actual chart and keeps independent fixed seeded geometry', () => {
  let first: number[][] | undefined;
  for (const difficulty of difficulties) for (const seed of [0, 1, 2026, 0xfffffffe]) {
    const a = new Simulation(volume), b = new Simulation(volume);
    a.start(difficulty, seed); b.start(difficulty, seed);
    const plan = a.outroPlan!;
    expect(plan).toEqual(b.outroPlan);
    expect(a.branch?.layout).toEqual(branchLayout(seed));
    expect(a.pickup?.kind).toBe(pickupForSeed(seed));
    expect(plan.mainLastStation).toBe(a.mainGates.at(-1)?.worldStation);
    expect(plan.gates).toHaveLength(24);
    expect(plan.gates[0].worldStation - plan.mainLastStation).toBe(ENCORE_FIRST_OFFSET);
    expect(plan.gates[0].worldStation).toBeGreaterThan(a.pickupStation);
    expect(plan.gates[0].worldStation).toBeGreaterThan(a.junctionPath!.end);
    for (const kind of ['iris', 'square', 'diamond']) expect(plan.gates.filter(g => g.kind === kind)).toHaveLength(8);
    for (const [i, gate] of plan.gates.entries()) {
      expect(i % 3 === 0).toBe(gate.kind === 'iris');
      if (i) {
        const gap = gate.worldStation - plan.gates[i - 1].worldStation;
        expect(gap).toBeGreaterThanOrEqual(ENCORE_MIN_SPACING);
        expect(gap).toBeLessThan(ENCORE_MAX_SPACING);
      }
      if (gate.kind !== 'iris') expect(lanePoint(gate.kind, gate.open, gate.axis)).toEqual([0, 0]);
    }
    const coords = plan.gates.map(gate => [gate.worldStation, gate.sector]);
    if (difficulty === 'normal' && seed === 0) first = coords;
    if (first && difficulty === 'normal' && seed !== 0) expect(coords).not.toEqual(first);
    expect(plan.afterglowStart - plan.gates.at(-1)!.worldStation).toBe(120);
    expect(plan.afterglowEnd + 430).toBeLessThan(a.path.length);
    expect(plan.afterglow.map(section => section.stage)).toEqual(['release', 'flow', 'luminous', 'closing']);
    expect(plan.afterglow.every(section => a.path.straightBetween(section.start, section.end))).toBe(true);
  }
});

test('full Boost awards 7200 on every route identity and maps crossing back to the same fixed world stations', () => {
  const routes = new Set<string>();
  for (const seed of [0, 1]) for (const side of routeSides) {
    const sim = new Simulation(volume, { align: true, branchSide: side });
    sim.start('normal', seed);
    const plan = sim.outroPlan!;
    const stations = plan.gates.map(gate => gate.worldStation);
    let entered = 0;
    while (sim.phase === 'playing') {
      sim.step(STEP, boostInput);
      if (!entered && sim.outroPhase === 'afterglow') entered = sim.time;
      expect(sim.previewEncore.length).toBeLessThanOrEqual(3);
    }
    routes.add(`${sim.route}/${side}`);
    expect(plan.gates.map(g => g.worldStation)).toEqual(stations);
    expect(plan.gates.every(g => g.judged && g.clean && g.routeStation === sim.junctionPath!.arcAt(g.worldStation, side))).toBe(true);
    expect(sim.result).toMatchObject({ title: 'ESCAPED', accuracy: 1, rank: 'S', passed: sim.gatesTotal,
      encore: { encountered: 24, passed: 24, clean: 24, missed: 0, bonusScore: 7200 } });
    expect(sim.beat).toBe(448);
    expect(entered).toBeLessThan(209);
    expect(sim.trackDistance).toBeLessThan(plan.afterglowEnd);
    console.log('ENCORE ' + JSON.stringify({ seed, side, route: sim.route, lastMain: sim.mainGates.at(-1)?.crossedAt,
      mainStation: plan.mainLastStation, first: stations[0], last: stations.at(-1), firstTime: plan.gates[0].crossedAt,
      lastTime: plan.gates.at(-1)?.crossedAt, entered, end: sim.trackDistance, afterglow: plan.afterglow,
      score: Math.floor(sim.score), encore: sim.encore }));
  }
  expect(routes).toEqual(new Set(['main/center', 'score/left', 'score/right', 'challenge/left', 'challenge/right']));
});

test('the real keyboard response clears every Iris direction at max Boost after a 150ms reaction delay', () => {
  const fullSpeed = cruiseTarget(Infinity) * BOOST_MULTIPLIER;
  const seen = new Set<number>();
  for (let seed = 0; seed < 12 && seen.size < 8; seed++) {
    const flags = { align: true };
    const sim = new Simulation(volume, flags);
    sim.start('normal', seed);
    while (sim.outroPhase === 'main') sim.step(STEP, boostInput);
    flags.align = false;
    let previous = sim.mainGates.at(-1)!.crossedAt!;
    for (const gate of sim.outroPlan!.gates) {
      if (gate.kind === 'iris') seen.add(gate.sector);
      const [x, y] = lanePoint(gate.kind, gate.open, gate.axis);
      const axis = (goal: number, current: number) => Math.max(-1, Math.min(1, (goal - current) / (6.2 * STEP)));
      while (!gate.judged && sim.phase === 'playing') {
        const ready = sim.time >= previous + .150;
        sim.step(STEP, { ...boostInput, axisX: ready ? axis(x, sim.camera.tx) : 0,
          axisY: ready ? axis(y, sim.camera.ty) : 0 });
      }
      expect(gate.clean, `${seed}/${gate.index} ${gate.kind}/${gate.sector}`).toBe(true);
      expect(sim.speed).toBeCloseTo(fullSpeed);
      previous = gate.crossedAt!;
    }
  }
  expect(seen.size).toBe(8);
  // Each admissible opening is connected to the central target by the same keyboard travel bound.
  for (let sector = 0; sector < 8; sector++) {
    const [x, y] = lanePoint('iris', sector, 0);
    expect(canPass('iris', sector, 0, x, y)).toBe(true);
    expect(Math.max(Math.abs(x), Math.abs(y)) / 6.2 + .15 + .20).toBeLessThan(ENCORE_MIN_SPACING / fullSpeed);
  }
});

test('a single sweep orders the last main crossing before several Encore gates and terminates on a fatal main miss', () => {
  const nearEnd = () => {
    const flags = { align: true };
    const sim = new Simulation(volume, flags);
    sim.start('normal', 0);
    const last = sim.mainGates.at(-1)!;
    while (sim.distance < last.routeStation - 1.1) sim.step(STEP, boostInput);
    flags.align = false;
    return { sim, last, gates: sim.outroPlan!.gates };
  };
  const { sim, last, gates } = nearEnd();
  sim.step(6, boostInput, true);
  expect(last.neutralizedByRecovery).toBe(true);
  expect(sim.encore).toMatchObject({ encountered: 2, neutralized: 2, bonusScore: 0 });
  expect(last.crossedAt!).toBeLessThan(gates[0].crossedAt!);
  expect(gates[0].crossedAt!).toBeLessThan(gates[1].crossedAt!);
  expect(gates[2].judged).toBe(false);
  const fatal = nearEnd();
  fatal.sim.lives = 1;
  const target: [number, number] = fatal.last.kind === 'iris' ? [0, 0] : [3, 0];
  Object.assign(fatal.sim.camera, { x: target[0], y: target[1], tx: target[0], ty: target[1] });
  fatal.sim.step(6, { ...boostInput, target });
  expect(fatal.sim.result?.title).toBe('TERMINATED');
  expect(fatal.sim.outroPhase).toBe('main');
  expect(fatal.gates.every(gate => !gate.judged)).toBe(true);
});

test('misses and recovery never change main scores, combo, pickup effects, or best-score eligibility', () => {
  const play = (style: 'clean' | 'miss' | 'pass' | 'recovery') => {
    const flags = { align: true };
    const sim = new Simulation(volume, flags);
    sim.start('normal', 0, 'shield');
    while (sim.outroPhase === 'main') sim.step(STEP, boostInput);
    sim.shield = true;
    sim.resonance = 8;
    const before = [sim.lives, sim.combo, sim.maxCombo, sim.gatesTotal, sim.gatesPassed, sim.hitTime];
    flags.align = style === 'clean';
    while (sim.outroPhase !== 'afterglow') {
      const next = sim.outroPlan!.gates.find(g => !g.judged);
      const sector = next ? next.sector * Math.PI / 4 : 0;
      const target: [number, number] = style === 'pass' && next?.kind === 'iris' ? [3.21 * Math.cos(sector), 2.47 * Math.sin(sector)]
        : style === 'pass' ? [1.2, 0] : next?.kind === 'iris' ? [0, 0] : [3, 0];
      sim.step(STEP, { ...boostInput, target }, style === 'recovery');
    }
    expect([sim.lives, sim.combo, sim.maxCombo, sim.gatesTotal, sim.gatesPassed, sim.hitTime]).toEqual(before);
    expect([sim.shield, sim.resonance, sim.gatesNeutralized]).toEqual([true, 8, 0]);
    while (sim.phase === 'playing') sim.step(STEP, boostInput);
    return sim;
  };
  const clean = play('clean'), miss = play('miss'), pass = play('pass'), recovery = play('recovery');
  expect(clean.encore).toMatchObject({ passed: 24, clean: 24, combo: 24, bonusScore: 7200 });
  expect(miss.encore).toMatchObject({ passed: 0, missed: 24, combo: 0, bonusScore: 0 });
  expect(pass.encore?.passed).toBe(24);
  expect(pass.encore!.clean).toBeLessThan(24);
  expect(pass.encore?.bonusScore).toBe(4800 + pass.encore!.clean * 100);
  expect(recovery.encore).toMatchObject({ passed: 0, missed: 0, neutralized: 24, bonusScore: 0 });
  for (const sim of [miss, pass, recovery]) {
    expect(sim.score).toBe(clean.score);
    expect(sim.result).toMatchObject({ title: 'ESCAPED', accuracy: 1, rank: 'S', neutralized: 0 });
  }
});

test('song end leaves future Encore gates untouched, and Sightseeing uses the light-only plan', () => {
  expect(previewResults(0, 'Main Complete').result?.encore).toBeUndefined();
  const partial = previewResults(0, 'Partial Encore');
  expect(partial.result?.encore?.encountered).toBeGreaterThan(0);
  expect(partial.result?.encore?.encountered).toBeLessThan(24);
  console.log('PARTIAL ENCORE ' + JSON.stringify({ score: partial.score, encore: partial.result?.encore }));
  expect(previewResults(0, 'Perfect Encore').result?.encore?.bonusScore).toBe(7200);
  expect(previewResults(0, 'Sightseeing Complete')).toMatchObject({ lives: 5, mode: 'sightseeing' });
  expect(previewResults(0, 'Sightseeing Complete').result?.encore).toBeUndefined();
  const sim = new Simulation(volume, { align: true });
  sim.start('normal', 0, undefined, 'sightseeing');
  const plan = sim.outroPlan!;
  expect(plan.gates).toEqual([]);
  while (sim.outroPhase !== 'afterglow' && sim.phase === 'playing') sim.step(STEP, boostInput);
  expect(sim.outroPhase).toBe('afterglow');
  console.log('SIGHTSEEING ENCORE ' + JSON.stringify({ entered: sim.time, last: plan.mainLastStation, afterglow: plan.afterglow }));
  expect(sim.lives).toBe(5);
  expect(sim.encore).toBeUndefined();
});

test('inspection reuses exact planned gates and supports independent music beat and route arc', () => {
  const studio = new OutroInspection('standard', 20, 'score');
  for (const [preset, index] of [['encore-first', 0], ['encore-middle', 11], ['encore-final', 23]] as const) {
    const view = outroView(studio.plan, preset);
    expect(view.gate).toBe(studio.plan.gates[index]);
    const a = studio.state(view.station, 256, 'Cruise'), b = studio.state(view.station, 448, 'Boost');
    expect(a.previewEncore.find(g => g.index === index)).toBe(b.previewEncore.find(g => g.index === index));
    expect(a.distance).toBe(b.distance);
    expect(a.trackDistance).toBe(b.trackDistance);
    expect(a.beat).not.toBe(b.beat);
  }
  expect(lightingState(432, true, true).level).toBe(1);
  expect(lightingState(448, true, true).level).toBeCloseTo(.72);
  expect(lightingState(448, true, true).hue).toBe(lightingState(448, true).hue);
});
