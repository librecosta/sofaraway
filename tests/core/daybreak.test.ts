import { expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { chartFor, daybreakPacing } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, clamp, HUB_R, lanePoint } from '../../app/game/core/collision';
import { daybreakGateKinds, daybreakGates, daybreakProfile, isCabinEdge } from '../../app/game/core/daybreak-gates';
import type { GateVertex } from '../../app/game/core/daybreak-gates';
import { idleInput } from '../../app/game/core/input';
import { SECTION_OUTLINE } from '../../app/game/core/section';
import { Simulation } from '../../app/game/core/simulation';
import { sectionAt, volumeById } from '../../app/game/core/volumes';

const volume = volumeById('daybreak');

test('DAYBREAK retains its score boundaries and uses four fixed gate profiles', () => {
  expect(volumeById('drift')).toBe(volume);
  expect([volume.name, volume.bpm, volume.beats]).toEqual(['DAYBREAK', 120, 288]);
  expect(volume.sections.map(({ name, beats }) => [name, beats])).toEqual([
    ['OPEN', 16], ['GLIDE', 64], ['LIFT', 48], ['BREEZE', 32], ['SUNBURST', 64], ['RETURN', 48], ['OUTRO', 16],
  ]);
  for (const difficulty of difficulties) {
    const chart = chartFor(volume, difficulty);
    expect(chart).toEqual(chartFor(volume, difficulty));
    expect(volume.sections.map(({ name }) => chart.filter(gate => gate.section === name).length))
      .toEqual(difficulty === 'easy' ? [0, 16, 12, 4, 21, 12, 0] : [0, 24, 18, 6, 31, 18, 0]);
    expect(new Set(chart.map(gate => gate.kind))).toEqual(new Set(daybreakGateKinds));
    for (const [i, gate] of chart.entries()) {
      expect(sectionAt(volume, gate.beat)?.name).toBe(gate.section);
      if (i) expect(gate.beat - chart[i - 1].beat).toBeGreaterThanOrEqual(1.25);
    }
  }
});

test('added gates preserve the 65 original speed anchors and never advance the speed ramp', () => {
  const anchors = daybreakPacing(volume).flatMap(section => section.beats);
  const chart = chartFor(volume, 'normal');
  expect(anchors).toHaveLength(65);
  expect(chart.filter(gate => anchors.includes(gate.beat)).map(gate => gate.beat)).toEqual(anchors);
  const sim = new Simulation(volume);
  for (const beat of [16, 64, 138, 184, 268, 288]) {
    const station = sim.reference.station(beat, 'standard');
    expect(sim.reference.countThrough(station, 'standard', 0)).toBe(anchors.filter(anchor => anchor <= beat).length);
  }
  expect(sim.reference.station(64, 'standard')).toBeCloseTo(5000.719435579, 7);
});

test('Crystal variants share the cabin perimeter and have radial cuts around a larger octagonal hub', () => {
  const base = 'daybreak-crystal', rotated = 'daybreak-crystal-45';
  const first = daybreakProfile(base, -1), second = daybreakProfile(rotated, -1);
  for (const profile of [first, second]) {
    expect(profile.pane).toBe(SECTION_OUTLINE);
    expect(profile.seams).toHaveLength(16);
    for (const [[x, y], [qx, qy]] of profile.seams.slice(8)) {
      const apothem = Math.hypot((x + qx) / 2, (y + qy) / 2);
      expect(apothem).toBeCloseTo(1.12, 9);
      expect(apothem).toBeGreaterThan(HUB_R);
    }
  }
  for (const open of daybreakGates[base].openings.keys()) {
    const p = daybreakProfile(base, open), q = daybreakProfile(rotated, open);
    for (const profile of [p, q]) {
      expect(profile.rim).toHaveLength(3);
      expect(profile.rim.every(([start, end]) => !isCabinEdge(start, end))).toBe(true);
    }
    expect(q.target[0]).toBeCloseTo((p.target[0] + p.target[1]) * Math.SQRT1_2, 10);
    expect(q.target[1]).toBeCloseTo((p.target[1] - p.target[0]) * Math.SQRT1_2, 10);
    for (const kind of [base, rotated] as const) expect(canPass(kind, open, 0, 0, 0)).toBe(false);
  }
});

test('only the intended opening interrupts the glass at the cabin boundary', () => {
  for (const kind of daybreakGateKinds) for (const open of daybreakGates[kind].openings.keys()) {
    const { gap, pane, hole, rim } = daybreakProfile(kind, open);
    const area = (polygon: readonly GateVertex[]) =>
      polygon.reduce((sum, [x, y], i) => {
        const [qx, qy] = polygon[(i + 1) % polygon.length];
        return sum + (x * qy - y * qx) / 2;
      }, 0);
    expect(area(pane) - (hole ? area(hole) : 0) + area(gap!)).toBeCloseTo(area(SECTION_OUTLINE), 10);
    expect(rim.every(([start, end]) => !isCabinEdge(start, end))).toBe(true);
  }
});

test('all ten openings admit a reachable target with clearance and keep the other regions solid', () => {
  for (const kind of daybreakGateKinds) {
    const definitions = daybreakGates[kind].openings;
    for (const open of definitions.keys()) {
      const { target } = daybreakProfile(kind, open);
      const context = `${kind} ${open}`;
      for (const [dx, dy] of [[-.2, 0], [.2, 0], [0, -.2], [0, .2]]) {
        expect(canPass(kind, open, 0, target[0] + dx, target[1] + dy), context).toBe(true);
      }
      expect(lanePoint(kind, open, 1), context).toEqual(target);
      for (const other of definitions.keys()) {
        if (open !== other) expect(canPass(kind, open, 0, ...lanePoint(kind, other, 0)), context).toBe(false);
      }
    }
  }
  expect(canPass('daybreak-vertical', 0, 0, 0, 1.55)).toBe(true);
  expect(canPass('daybreak-vertical', 0, 0, 1.18, 0)).toBe(false);
  expect(canPass('daybreak-horizontal', 0, 0, 1.75, 0)).toBe(true);
  expect(canPass('daybreak-horizontal', 0, 0, 0, 1.18)).toBe(false);
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
        seen.add(`${gate.kind}:${gate.open}`);
      }
      const target = gate && sim.time >= ready ? lanePoint(gate.kind, gate.open, gate.axis) : null;
      const axis = (coordinate: 0 | 1, value: number) => target ? clamp((target[coordinate] - value) / (6.2 * STEP), -1, 1) : 0;
      sim.step(STEP, { ...idleInput, axisX: axis(0, sim.camera.tx), axisY: axis(1, sim.camera.ty), boosting });
    }
    expect(sim.result, `Boost=${boosting}`).toMatchObject({ title: 'ESCAPED', accuracy: 1, unreached: 0 });
    expect(sim.hits).toBe(0);
    expect(sim.beat).toBe(288);
    const expected = new Set(chartFor(volume, difficulty).map(gate => `${gate.kind}:${gate.sector}`));
    expect(seen).toEqual(expected);
    if (difficulty !== 'easy') expect(seen.size).toBe(10);
  }
});

test('DAYBREAK sightseeing keeps five lives, one-third speed, and its lighter chart', () => {
  const standard = new Simulation(volume);
  const sightseeing = new Simulation(volume, {}, undefined, 'sightseeing');
  standard.start('normal');
  sightseeing.start('normal', undefined, undefined, 'sightseeing');
  expect(sightseeing.lives).toBe(5);
  expect(sightseeing.speed).toBeCloseTo(standard.speed / 3);
  expect(sightseeing.gatesTotal).toBe(32);
});
