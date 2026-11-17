import { expect, test } from 'vitest';
import { difficulties, type Difficulty } from '../../app/game/contracts';
import { branchLayout, routeSides, type RouteKind } from '../../app/game/core/branches';
import { chartFor, difficultySettings } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, clamp, lanePoint } from '../../app/game/core/collision';
import { descentGateKinds, isDescentGate, laserBandPitch, laserOpening } from '../../app/game/core/descent-gates';
import { descentCargo } from '../../app/game/core/descent-routes';
import { controlEvents, controlTrack, step } from '../../app/game/core/descent-score';
import { difficultiesFor } from '../../app/game/core/difficulty';
import type { EncoreGate } from '../../app/game/core/encore';
import { idleInput, steeringDamping } from '../../app/game/core/input';
import { corridorLength, Simulation, type RunGate } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';

const volume = volumeById('descent');
const totals = { main: 189, challenge: 190, score: 184 };
const routeGates = { main: 10, challenge: 11, score: 5 };

test('DESCENT Impossible keeps Hard opening choreography on the faster reference and adds CONTROL accents', () => {
  expect(difficultiesFor('descent')).toEqual([...difficulties, 'impossible']);
  expect(difficultiesFor('orbit')).toEqual(difficulties);
  expect(difficultySettings(volume, 'impossible')).toMatchObject({ lives: 1, mult: 3.4, speedFactor: 1.15 });
  const hard = chartFor(volume, 'hard');
  const impossible = chartFor(volume, 'impossible');
  expect(hard).toHaveLength(161);
  expect(chartFor(volume, 'normal')).toEqual(hard);
  expect(chartFor(volume, 'easy')).toEqual(hard);
  expect(chartFor(volume, 'impossible', 9000)).toEqual(impossible);
  expect(impossible.filter(gate => !gate.inserted)).toEqual(hard);
  expect(impossible).toHaveLength(totals.main);
  expect(new Set(impossible.map(gate => gate.beat)).size).toBe(totals.main);
  expect(controlTrack.sections.map(({ name }) => impossible.filter(gate => gate.inserted && gate.section === name).length))
    .toEqual([0, 6, 8, 7, 0, 7, 0]);

  const accents = new Set(controlEvents.filter(event => ['kick', 'snare', 'ghost'].includes(event.voice))
    .map(event => Math.round(event.at / step) / 4));
  for (const seed of [0, 1]) {
    const before = new Simulation(volume), after = new Simulation(volume);
    before.start('hard', seed);
    after.start('impossible', seed);
    expect(before.reference.scale).toBe(1);
    expect(after.reference.scale).toBe(1.15);
    expect(after.pickupStation).toBe(after.reference.station(descentCargo.beat, 'standard'));
    expect(after.speed).toBeCloseTo(27.6, 8);
    expect(after.lives).toBe(1);
    expect(after.outroPlan!.mainLastStation).toBe(after.mainGates.at(-1)!.worldStation);
    expect(after.gatesTotal).toBe(totals.main);
    const compare = (base: readonly RunGate[], dense: readonly RunGate[]) => {
      expect(dense.filter(gate => !gate.inserted).map(({ beat, kind, open, axis }) => [beat, kind, open, axis]))
        .toEqual(base.map(({ beat, kind, open, axis }) => [beat, kind, open, axis]));
      for (const gate of dense) expect(gate.worldStation).toBe(after.reference.station(gate.beat, 'standard'));
      for (const gate of dense.filter(gate => gate.inserted)) {
        expect(accents.has(gate.beat), `CONTROL onset at ${gate.beat}`).toBe(true);
      }
    };
    compare(before.mainGates, after.mainGates);
    expect(after.mainGates.filter(gate => gate.beat > 126.5 && gate.beat < 169)).toEqual([]);
    const routeNames = Object.keys(routeGates) as RouteKind[];
    for (const route of routeNames) {
      const side = routeSides.find(side => branchLayout(seed)[side] === route)!;
      const routeChart = after.branchGates![route];
      compare(before.branchGates![route], routeChart);
      expect(routeChart).toHaveLength(routeGates[route]);
      expect(routeChart[0].beat).toBe(route === 'score' ? 146 : 145);
      expect(routeChart.at(-1)!.beat).toBeLessThanOrEqual(159);
      for (const gate of routeChart) expect(gate.routeStation).toBe(after.junctionPath!.arcAt(gate.worldStation, side));
    }
  }
});

test('Sightseeing and the full-speed world bounds use the existing shared rules', () => {
  const scenic = new Simulation(volume), baseline = new Simulation(volume);
  scenic.start('impossible', 0, 'lumen', 'sightseeing');
  baseline.start('normal', 0, 'lumen', 'sightseeing');
  expect(scenic.difficulty).toBe('normal');
  expect(scenic.lives).toBe(5);
  expect(scenic.speed).toBe(8);
  expect(scenic.mainGates).toEqual(baseline.mainGates);
  expect(scenic.branchGates).toEqual(baseline.branchGates);
  expect(scenic.outroPlan?.gates).toEqual([]);
  const finish = baseline.reference.boostFinish('standard', 1.15);
  expect(corridorLength(volume)).toBeGreaterThanOrEqual(finish + 650);
  const standard = new Simulation(volume);
  expect(standard.path.length).toBeGreaterThanOrEqual(finish + 650);
});

const keyboardAxis = (delta: number) => Math.abs(delta) < .08 ? 0 : Math.sign(delta);

function openingOf(gate: RunGate | EncoreGate) {
  if (!isDescentGate(gate.kind)) throw new Error(`Unexpected DESCENT gate ${gate.kind}`);
  return laserOpening(gate.kind, gate.open, gate.axis);
}

// Use the visible opening's safe side to prepare for the next movement, as a
// player looking ahead would. Only the keyboard axes are sent to Simulation.
function aimPoints(gates: (RunGate | EncoreGate)[]) {
  const centers = gates.map(gate => lanePoint(gate.kind, gate.open, gate.axis));
  return gates.map((gate, i) => {
    const [x, y] = centers[i];
    const [px, py] = centers[i - 1] ?? [0, 0], [nx, ny] = centers[i + 1] ?? [0, 0];
    const { normal: [a, b], extent: [w, h] } = openingOf(gate);
    const hintX = .14 * x + .33 * px + .53 * nx, hintY = .14 * y + .33 * py + .53 * ny;
    const margin = .24;
    if (h !== null) return [clamp(hintX, x - w + margin, x + w - margin), clamp(hintY, y - h + margin, y + h - margin)];
    const offset = (hintX - x) * a + (hintY - y) * b;
    const shift = clamp(offset, -w + margin, w - margin) - offset;
    return [hintX + shift * a, hintY + shift * b];
  });
}

const endingRuns = (['normal', 'hard', 'impossible'] as const).flatMap(difficulty =>
  (['cruise', 'boost', 'mixed'] as const).map(motion => [difficulty, motion] as const));

test.each(endingRuns)('DESCENT %s %s clears each route with 60 Hz keys and 150 ms reaction', (difficulty, motion) => {
  for (const seed of [0, 1]) for (const side of routeSides) {
    const sim = new Simulation(volume);
    sim.start(difficulty, seed, 'lumen');
    const route = branchLayout(seed)[side];
    const path = sim.junctionPath!;
    const main = [...sim.mainGates, ...sim.branchGates![route]].sort((a, b) => a.worldStation - b.worldStation);
    const plan = sim.outroPlan!;
    const gates = [...main, ...plan.gates];
    const targets = aimPoints(gates);
    const spotted = new Map<number, number>();
    let lastCrossing = -Infinity, maxSpeed = 0, afterglowAt = Infinity;
    let recognized: number | undefined, committed: number | undefined;
    while (sim.phase === 'playing') {
      if (sim.routeGuide) recognized ??= sim.time;
      if (sim.route) committed ??= sim.time;
      for (const gate of [...sim.previewGates, ...sim.previewEncore]) {
        if (!spotted.has(gate.worldStation)) spotted.set(gate.worldStation, sim.time);
      }
      const index = sim.gatesJudged + (sim.encore?.encountered ?? 0);
      const gate = gates[index];
      let [x, y] = [sim.camera.tx, sim.camera.ty];
      if (gate && sim.time >= lastCrossing + .15 - 1e-9) {
        if (!sim.route && gate.worldStation > path.split) {
          x = sim.time - (recognized ?? Infinity) < .5 ? 0 : side === 'left' ? -3.15 : side === 'right' ? 3.15 : 0;
          y = 0;
        } else if (sim.pickup?.status === 'pending' && sim.pickupVisible && gate.worldStation > sim.pickupStation) {
          [x, y] = [0, 0];
        } else {
          [x, y] = targets[index];
        }
      }
      const before = { x: sim.camera.x, y: sim.camera.y, distance: sim.distance };
      const boosting = motion === 'boost' || (motion === 'mixed' && sim.time % 6 < 2.5);
      sim.step(STEP, { ...idleInput, boosting, axisX: keyboardAxis(x - sim.camera.tx), axisY: keyboardAxis(y - sim.camera.ty) });
      maxSpeed = Math.max(maxSpeed, sim.speed);
      if (sim.outroPhase === 'afterglow') afterglowAt = Math.min(afterglowAt, sim.time);
      if (sim.gatesJudged + (sim.encore?.encountered ?? 0) === index) continue;
      const crossed = index < main.length ? sim.mainGates[index] : plan.gates[index - main.length];
      const label = `${difficulty}/${route}/seed ${seed}/station ${gate.worldStation}`;
      expect(crossed.worldStation, label).toBe(gate.worldStation);
      if ('index' in crossed) expect(crossed.passed, label).toBe(true);
      else expect(sim.gatesPassed, label).toBe(index + 1);
      lastCrossing = crossed.crossedAt!;
      const fraction = clamp((crossed.routeStation - before.distance) / (sim.distance - before.distance), 0, 1);
      const { target, normal, extent } = openingOf(crossed);
      const dx = before.x + (sim.camera.x - before.x) * fraction - target[0];
      const dy = before.y + (sim.camera.y - before.y) * fraction - target[1];
      const across = Math.abs(dx * normal[0] + dy * normal[1]);
      expect(extent[0] - across, label).toBeGreaterThan(.08);
      if (extent[1] !== null) expect(extent[1] - Math.abs(dy), label).toBeGreaterThan(.08);
      if ('index' in crossed) {
        expect(lastCrossing - spotted.get(crossed.worldStation)!, label).toBeGreaterThan(7.8);
        expect(crossed.routeStation).toBe(path.arcAt(crossed.worldStation, side));
      } else if (crossed.inserted) {
        const previewSeconds = crossed.route ? 1.4 : 7.8;
        expect(lastCrossing - spotted.get(gate.worldStation)!, label).toBeGreaterThan(previewSeconds);
      }
    }
    expect(recognized!).toBeGreaterThan(main.find(gate => gate.beat === 126.5)!.crossedAt!);
    expect(committed! - recognized!).toBeGreaterThan(2.75);
    expect(sim.branchGates![route][0].crossedAt! - committed!).toBeGreaterThan(1.55);
    expect(sim.result).toMatchObject({ title: 'ESCAPED', route, accuracy: 1, unreached: 0 });
    expect(sim.hits).toBe(0);
    expect(sim.gatesPassed).toBe(difficulty === 'impossible' ? totals[route] : route === 'score' ? 158 : 161);
    expect(sim.pickup?.status).toBe(route === 'score' ? 'collected' : undefined);
    expect(sim.path.length - sim.trackDistance).toBeGreaterThan(650);
    const duration = volume.beats * sim.secondsPerBeat;
    const speed = 34 * difficultySettings(volume, difficulty).speedFactor;
    if (motion === 'boost') {
      expect(maxSpeed).toBeCloseTo(speed * 1.45, 5);
      expect(sim.encore).toMatchObject({ passed: plan.gates.length, missed: 0, neutralized: 0 });
      expect(sim.result?.encore).toEqual(sim.encore);
      expect(duration - afterglowAt).toBeGreaterThanOrEqual(12 - STEP);
      expect(sim.trackDistance).toBeLessThan(plan.afterglowEnd);
      if (seed === 0) console.log('DESCENT ENDING', { difficulty, route, count: plan.gates.length,
        first: plan.gates[0].worldStation, last: plan.gates.at(-1)!.worldStation, entry: plan.afterglowStart,
        end: sim.trackDistance, reserve: duration - afterglowAt });
    } else if (motion === 'cruise') {
      expect(maxSpeed).toBeCloseTo(speed, 5);
      expect(sim.encore).toBeUndefined();
      for (let i = 0; i < 25; i++) sim.step(1, idleInput);
      expect(sim.phase).toBe('results');
      expect(sim.distance).toBeLessThanOrEqual(plan.gates[0].routeStation - 4 + 1e-9);
    } else {
      expect(sim.encore?.passed).toBeGreaterThan(0);
      expect(sim.encore?.passed).toBeLessThan(plan.gates.length);
    }
    expect(sim.gateLoadAhead).toBe(450);
  }
});

test('DESCENT Encore is a bounded seeded score with readable legal openings', () => {
  const make = (difficulty: Difficulty, seed: number) => {
    const sim = new Simulation(volume);
    sim.start(difficulty, seed);
    return sim.outroPlan!;
  };
  for (const difficulty of ['easy', 'normal', 'hard', 'impossible'] as const) {
    for (const seed of [0, 1, 42, 0xfffffffe]) {
      const plan = make(difficulty, seed);
      expect(plan.gates).toEqual(make(difficulty, seed).gates);
      expect(plan.gates).not.toEqual(make(difficulty, (seed + 1) >>> 0).gates);
      expect(new Set(plan.gates.map(gate => gate.kind))).toEqual(new Set(descentGateKinds));
      expect(new Set(plan.gates.filter(gate => gate.kind === 'laser-matrix').map(gate => gate.open))).toEqual(new Set([0, 2, 4, 6]));
      for (const kind of ['laser-slice', 'laser-weave']) {
        expect(new Set(plan.gates.filter(gate => gate.kind === kind).map(gate => gate.axis))).toEqual(new Set([0, 1]));
      }
      expect(plan.gates[0].worldStation - plan.mainLastStation).toBeGreaterThanOrEqual(155);
      for (const [i, gate] of plan.gates.entries()) {
        expect(canPass(gate.kind, gate.open, gate.axis, ...lanePoint(gate.kind, gate.open, gate.axis))).toBe(true);
        if (i) expect(gate.worldStation - plan.gates[i - 1].worldStation).toBeGreaterThanOrEqual(difficulty === 'impossible' ? 91.3 : 83);
      }
      expect(plan.afterglowStart - plan.gates.at(-1)!.worldStation).toBe(42);
      expect(plan.afterglowEnd).toBeGreaterThan(plan.musicEndStation);
    }
  }
});

test('DESCENT keeps last main hits, Encore pass/miss/recovery and audio-tail settling independent', () => {
  const boost = { ...idleInput, boosting: true };
  for (const difficulty of ['normal', 'impossible'] as const) {
    const sim = new Simulation(volume, { align: true });
    sim.start(difficulty, 0, 'lumen');
    const cross = (gate: RunGate | EncoreGate, action: 'pass' | 'miss' | 'recovery') => {
      while (sim.distance + sim.speed * STEP < gate.routeStation && sim.phase === 'playing') sim.step(STEP, boost);
      if (action === 'miss') {
        const { target, normal, extent } = openingOf(gate);
        const fraction = (gate.routeStation - sim.distance) / (sim.speed * STEP);
        const offset = (extent[0] + laserBandPitch / 2) / (1 - steeringDamping(STEP) * fraction);
        sim.camera.x = sim.camera.tx = target[0] + normal[0] * offset;
        sim.camera.y = sim.camera.ty = target[1] + normal[1] * offset;
      }
      sim.step(STEP, boost, action === 'recovery');
      expect(gate.judged).toBe(true);
    };
    cross(sim.mainGates.at(-1)!, 'miss');
    expect(sim.hits).toBe(1);
    expect(sim.gatesPassed).toBe(sim.gatesTotal - 1);
    expect(sim.encore).toBeUndefined();
    if (difficulty === 'impossible') {
      expect(sim.result).toMatchObject({ title: 'TERMINATED', unreached: 0 });
      expect(sim.beat).toBeLessThan(volume.beats);
      expect(sim.escapeWhite).toBe(0);
      continue;
    }
    const { gates } = sim.outroPlan!;
    cross(gates[0], 'miss');
    cross(gates[1], 'recovery');
    const score = sim.score, station = sim.distance;
    cross(gates[2], 'pass');
    expect(sim.encore).toMatchObject({ encountered: 3, passed: 1, clean: 1, missed: 1, neutralized: 1, combo: 1, bonusScore: 300 });
    expect(sim.score - score).toBeCloseTo((sim.distance - station) * .35, 6);
    expect(sim.gatesJudged).toBe(sim.gatesTotal);
    expect(sim.hits).toBe(1);
    while (sim.phase === 'playing') sim.step(STEP, boost);
    expect(sim.result).toMatchObject({ title: 'ESCAPED', encore: { missed: 1, neutralized: 1 }, unreached: 0 });
    expect(sim.beat).toBe(volume.beats);
    expect(sim.escapeWhite).toBe(0);
    const finishedAt = sim.time, cutoff = sim.distance;
    while (sim.phase === 'crash') sim.step(STEP, idleInput);
    expect(sim.time - finishedAt).toBeCloseTo(volume.soundtrack!.tail, 6);
    expect(sim.distance).toBeGreaterThan(cutoff);
    expect(sim.escapeWhite).toBe(0);
  }
});

test('DESCENT Sightseeing traverses the industrial Afterglow without reward gates', () => {
  for (const side of routeSides) {
    const sim = new Simulation(volume, { align: true, branchSide: side });
    sim.start('impossible', 1, 'lumen', 'sightseeing');
    while (sim.phase === 'playing') sim.step(STEP, idleInput);
    expect(sim.result).toMatchObject({ title: 'ESCAPED', route: branchLayout(1)[side], accuracy: 1, unreached: 0 });
    expect(sim.maxLives).toBe(5);
    expect(sim.outroPhase).toBe('afterglow');
    expect(sim.previewEncore).toEqual([]);
    expect(sim.encore).toBeUndefined();
  }
});
