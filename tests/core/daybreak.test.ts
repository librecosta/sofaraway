import { expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, clamp, lanePoint, SECTION } from '../../app/game/core/collision';
import { daybreakGateKinds, daybreakGates } from '../../app/game/core/daybreak-gates';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { sectionAt, volumeById } from '../../app/game/core/volumes';

const volume = volumeById('daybreak');

test('DAYBREAK retains its score boundaries and introduces eight fixed gate profiles', () => {
  expect(volumeById('drift')).toBe(volume);
  expect([volume.name, volume.bpm, volume.beats]).toEqual(['DAYBREAK', 120, 288]);
  expect(volume.sections.map(({ name, beats }) => [name, beats])).toEqual([
    ['OPEN', 16], ['GLIDE', 64], ['LIFT', 48], ['BREEZE', 32], ['SUNBURST', 64], ['RETURN', 48], ['OUTRO', 16],
  ]);
  for (const difficulty of difficulties) {
    const chart = chartFor(volume, difficulty);
    expect(chart).toEqual(chartFor(volume, difficulty));
    expect(volume.sections.map(({ name }) => chart.filter(gate => gate.section === name).length))
      .toEqual(difficulty === 'easy' ? [0, 11, 8, 3, 14, 8, 0] : [0, 16, 12, 4, 21, 12, 0]);
    expect(new Set(chart.map(gate => gate.kind))).toEqual(new Set(daybreakGateKinds));
    for (const [i, gate] of chart.entries()) {
      expect(sectionAt(volume, gate.beat)?.name).toBe(gate.section);
      if (i) expect(gate.beat - chart[i - 1].beat).toBeGreaterThanOrEqual(2.5);
    }
  }
});

test('the two gate families partition the full cabin and each always leaves exactly one fixed pane open', () => {
  const area = (pane: readonly (readonly [number, number])[]) => pane.reduce((sum, [x, y], i) => {
    const [nx, ny] = pane[(i + 1) % pane.length];
    return sum + x * ny - y * nx;
  }, 0) / 2;
  const { a, b, ch } = SECTION;
  const gates = Object.values(daybreakGates);
  expect(gates.slice(0, 4).map(gate => [gate.family, gate.missing, gate.turns])).toEqual(
    [0, 1, 2, 3].map(turn => ['A', 1, turn]));
  expect(new Set(gates.slice(4).map(gate => gate.missing))).toEqual(new Set([0, 1, 2]));
  for (const kind of daybreakGateKinds) {
    const { panes, solid, gap, target } = daybreakGates[kind];
    expect(panes).toHaveLength(3);
    expect(solid).toHaveLength(2);
    expect(panes.reduce((sum, pane) => sum + area(pane), 0)).toBeCloseTo(4 * a * b - 2 * ch ** 2, 8);
    expect(area(gap)).toBeGreaterThan(7);
    for (const [dx, dy] of [[-.2, 0], [.2, 0], [0, -.2], [0, .2]]) {
      expect(canPass(kind, 0, 0, target[0] + dx, target[1] + dy)).toBe(true);
      expect(canPass(kind, 2, 1, target[0] + dx, target[1] + dy)).toBe(true);
    }
    for (const pane of solid) {
      const center = pane.reduce(([x, y], [px, py]) => [x + px / pane.length, y + py / pane.length], [0, 0]);
      expect(canPass(kind, 0, 0, center[0], center[1])).toBe(false);
    }
  }
});

test.each(difficulties)('%s clears the new chart through actual steering at cruise and sustained Boost', difficulty => {
  for (const boosting of [false, true]) {
    const sim = new Simulation(volume);
    sim.start(difficulty);
    expect(sim.lives).toBe({ easy: 3, normal: 2, hard: 1 }[difficulty]);
    let judged = 0;
    let ready = 0;
    const seen = new Set();
    for (let frame = 0; sim.phase === 'playing' && frame <= 144 / STEP + 2; frame++) {
      if (sim.gatesJudged !== judged) {
        judged = sim.gatesJudged;
        ready = sim.time + .15;
      }
      const gate = sim.previewGates.find(item => !item.judged);
      if (gate) {
        expect(gate.axis).toBe(0);
        seen.add(gate.kind);
      }
      const target = gate && sim.time >= ready ? lanePoint(gate.kind, gate.open, gate.axis) : null;
      const axis = (coordinate: 0 | 1, value: number) => target ? clamp((target[coordinate] - value) / (6.2 * STEP), -1, 1) : 0;
      sim.step(STEP, { ...idleInput, axisX: axis(0, sim.camera.tx), axisY: axis(1, sim.camera.ty), boosting });
    }
    expect(sim.result, `Boost=${boosting}`).toMatchObject({ title: 'ESCAPED', accuracy: 1, unreached: 0 });
    expect(sim.hits).toBe(0);
    expect(sim.beat).toBe(288);
    expect(seen).toEqual(new Set(daybreakGateKinds));
  }
});

test('DAYBREAK sightseeing keeps five lives, one-third speed, and its lighter chart', () => {
  const standard = new Simulation(volume);
  const sightseeing = new Simulation(volume, {}, undefined, 'sightseeing');
  standard.start('normal');
  sightseeing.start('normal', undefined, undefined, 'sightseeing');
  expect(sightseeing.lives).toBe(5);
  expect(sightseeing.speed).toBeCloseTo(standard.speed / 3);
  expect(sightseeing.gatesTotal).toBe(21);
});
