import { expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { branchLayout, routeSides, type RouteKind } from '../../app/game/core/branches';
import { chartFor, difficultySettings } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { clamp, lanePoint } from '../../app/game/core/collision';
import { isDescentGate, laserOpening, type DescentGateKind } from '../../app/game/core/descent-gates';
import { descentCargo } from '../../app/game/core/descent-routes';
import { controlEvents, controlTrack, step } from '../../app/game/core/descent-score';
import { difficultiesFor } from '../../app/game/core/difficulty';
import { idleInput } from '../../app/game/core/input';
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
    expect(after.outroPlan).toBeUndefined();
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
  expect(scenic.outroPlan).toBeUndefined();
  const finish = baseline.reference.boostFinish('standard', 1.15);
  expect(corridorLength(volume)).toBeGreaterThanOrEqual(finish + 650);
  const standard = new Simulation(volume);
  expect(standard.path.length).toBeGreaterThanOrEqual(finish + 650);
});

const keyboardAxis = (delta: number) => Math.abs(delta) < .08 ? 0 : Math.sign(delta);

function openingOf(gate: RunGate) {
  if (!isDescentGate(gate.kind)) throw new Error(`Unexpected DESCENT gate ${gate.kind}`);
  return laserOpening(gate.kind as DescentGateKind, gate.open, gate.axis);
}

// Use the visible opening's safe side to prepare for the next movement, as a
// player looking ahead would. Only the keyboard axes are sent to Simulation.
function aimPoints(gates: RunGate[]) {
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

test.each(['cruise', 'boost', 'mixed'] as const)('Impossible %s clears each route with 60 Hz keys and 150 ms reaction', motion => {
  for (const seed of [0, 1]) for (const side of routeSides) {
    const sim = new Simulation(volume);
    sim.start('impossible', seed, 'lumen');
    const route = branchLayout(seed)[side];
    const path = sim.junctionPath!;
    const gates = [...sim.mainGates, ...sim.branchGates![route]].sort((a, b) => a.worldStation - b.worldStation);
    const targets = aimPoints(gates);
    const spotted = new Map<number, number>();
    let lastCrossing = -Infinity, maxSpeed = 0;
    let recognized: number | undefined, committed: number | undefined;
    while (sim.phase === 'playing') {
      if (sim.routeGuide) recognized ??= sim.time;
      if (sim.route) committed ??= sim.time;
      for (const gate of sim.previewGates) if (!spotted.has(gate.beat)) spotted.set(gate.beat, sim.time);
      const index = sim.gatesJudged;
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
      if (sim.gatesJudged === index) continue;
      const crossed = sim.mainGates[index];
      const label = `${route}/seed ${seed}/beat ${gate.beat}`;
      expect(crossed.beat, label).toBe(gate.beat);
      expect(sim.gatesPassed, label).toBe(index + 1);
      lastCrossing = crossed.crossedAt!;
      const fraction = clamp((crossed.routeStation - before.distance) / (sim.distance - before.distance), 0, 1);
      const { target, normal, extent } = openingOf(crossed);
      const dx = before.x + (sim.camera.x - before.x) * fraction - target[0];
      const dy = before.y + (sim.camera.y - before.y) * fraction - target[1];
      const across = Math.abs(dx * normal[0] + dy * normal[1]);
      expect(extent[0] - across, label).toBeGreaterThan(.08);
      if (extent[1] !== null) expect(extent[1] - Math.abs(dy), label).toBeGreaterThan(.08);
      if (crossed.inserted) {
        const previewSeconds = crossed.route ? 1.4 : 7.8;
        expect(lastCrossing - spotted.get(gate.beat)!, label).toBeGreaterThan(previewSeconds);
      }
    }
    expect(recognized!).toBeGreaterThan(gates.find(gate => gate.beat === 126.5)!.crossedAt!);
    expect(committed! - recognized!).toBeGreaterThan(2.75);
    expect(sim.branchGates![route][0].crossedAt! - committed!).toBeGreaterThan(1.55);
    expect(sim.result).toMatchObject({ title: 'ESCAPED', route, accuracy: 1, unreached: 0 });
    expect(sim.hits).toBe(0);
    expect(sim.gatesPassed).toBe(totals[route]);
    expect(sim.pickup?.status).toBe(route === 'score' ? 'collected' : undefined);
    expect(sim.path.length - sim.trackDistance).toBeGreaterThan(650);
    if (motion === 'boost') expect(maxSpeed).toBeCloseTo(56.695, 5);
    if (motion === 'cruise') expect(maxSpeed).toBeCloseTo(39.1, 5);
    expect(sim.gateLoadAhead).toBe(450);
  }
});
