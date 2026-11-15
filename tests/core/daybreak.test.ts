import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { difficulties } from '../../app/game/contracts';
import { chartFor } from '../../app/game/core/chart';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import type { RouteSide } from '../../app/game/core/branches';
import type { Difficulty, PlayMode } from '../../app/game/contracts';
import { STEP } from '../../app/game/core/clock';
import { canPass, clamp, HUB_R, lanePoint } from '../../app/game/core/collision';
import { rhythmTimeline } from '../../app/game/core/daybreak-score';
import { crystalOpenings, daybreakGateKinds, daybreakGates, daybreakProfile, isCabinEdge } from '../../app/game/core/daybreak-gates';
import type { GateVertex } from '../../app/game/core/daybreak-gates';
import { idleInput } from '../../app/game/core/input';
import { SECTION_OUTLINE } from '../../app/game/core/section';
import { Simulation } from '../../app/game/core/simulation';
import { sectionAt, volumeById } from '../../app/game/core/volumes';
import { pathFrame } from '../../app/game/graphics/branch-path';

const volume = volumeById('daybreak');

test('DAYBREAK retains its score boundaries and uses three fixed gate profiles', () => {
  expect(volumeById('drift')).toBe(volume);
  expect([volume.name, volume.bpm, volume.beats]).toEqual(['DAYBREAK', 120, 288]);
  expect(volume.sections.map(({ name, beats }) => [name, beats])).toEqual([
    ['OPEN', 16], ['GLIDE', 64], ['LIFT', 48], ['BREEZE', 32], ['SUNBURST', 64], ['RETURN', 48], ['OUTRO', 16],
  ]);
  for (const difficulty of difficulties) {
    const chart = chartFor(volume, difficulty);
    expect(chart).toEqual(chartFor(volume, difficulty));
    expect(volume.sections.map(({ name }) => chart.filter(gate => gate.section === name).length))
      .toEqual([0, 28, 22, 7, 38, 25, 0]);
    expect(new Set(chart.map(gate => gate.kind))).toEqual(new Set(daybreakGateKinds));
    for (const [i, gate] of chart.entries()) {
      expect(sectionAt(volume, gate.beat)?.name).toBe(gate.section);
      if (i) expect(gate.beat - chart[i - 1].beat).toBeGreaterThanOrEqual(1.26);
    }
  }
});

test('the real kick, snare and fill onsets drive the Main gates and the reference speed ramp', () => {
  const onsets = new Set(rhythmTimeline().filter(hit => hit.kind === 'kick' || hit.kind === 'snare' || hit.kind === 'fill')
    .map(hit => hit.beat));
  const chart = chartFor(volume, 'normal');
  expect(chart.every(gate => onsets.has(gate.beat))).toBe(true);
  expect(createHash('sha256').update(JSON.stringify(chart.map(gate => gate.beat))).digest('hex'))
    .toBe('9825a2767e304e28b1a172478bf293a4c3a0c0f74c4b6b738ff05be5455cbe5f');
  const sim = new Simulation(volume);
  for (const beat of [16, 64, 138, 184, 268, 288]) {
    const station = sim.reference.station(beat, 'standard');
    expect(sim.reference.countThrough(station, 'standard', 0)).toBe(chart.filter(gate => gate.beat <= beat).length);
  }
});

test('the authored routes move around the octagon and return through center windows', () => {
  const chart = chartFor(volume, 'normal');
  const crystalSectors = (section: string) => new Set(chart.filter(gate => gate.section === section && gate.kind === 'daybreak-crystal')
    .map(gate => gate.sector));
  expect(crystalSectors('SUNBURST').size).toBe(crystalOpenings.length);
  expect(crystalSectors('BREEZE').size).toBeLessThan(crystalSectors('LIFT').size);
  const sim = new Simulation(volume);
  sim.start('normal', 0);
  for (const gates of [chart, sim.branchGates!.challenge.map(gate => ({ ...gate, sector: gate.open }))]) {
    expect(gates.some((gate, i) => i && gate.kind === 'daybreak-crystal' && gates[i - 1].kind === gate.kind)).toBe(true);
    for (let i = 1; i < gates.length; i++) {
      if (gates[i].kind === 'daybreak-crystal' && gates[i - 1].kind === gates[i].kind) {
        expect(gates[i].sector).not.toBe(gates[i - 1].sector);
      }
    }
  }
  expect(sim.branchGates!.score.every(gate => gate.kind !== 'daybreak-crystal')).toBe(true);
});

test('Crystal keeps the cabin perimeter and the fixed radial cuts around its octagonal hub', () => {
  const base = 'daybreak-crystal';
  const full = daybreakProfile(base, -1);
  expect(full.pane).toBe(SECTION_OUTLINE);
  expect(full.seams).toHaveLength(16);
  for (const [[x, y], [qx, qy]] of full.seams.slice(8)) {
    const apothem = Math.hypot((x + qx) / 2, (y + qy) / 2);
    expect(apothem).toBeCloseTo(1.12, 9);
    expect(apothem).toBeGreaterThan(HUB_R);
  }
  for (const open of daybreakGates[base].openings.keys()) {
    const pane = daybreakProfile(base, open);
    const angle = open * Math.PI / 4;
    expect(pane.target[0]).toBeCloseTo(Math.cos(angle) * 2.08);
    expect(pane.target[1]).toBeCloseTo(Math.sin(angle) * 2.08);
    expect(pane.rim).toHaveLength(3);
    expect(pane.rim.every(([start, end]) => !isCabinEdge(start, end))).toBe(true);
    expect(canPass(base, open, 0, 0, 0)).toBe(false);
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


function fly(difficulty: Difficulty, motion: 'cruise' | 'boost' | 'intermittent', side: RouteSide = 'center', seed = 0,
  mode: PlayMode = 'standard', pickup?: 'shield' | 'resonance' | 'lumen', neutralizeEncore = false) {
  const sim = new Simulation(volume);
  sim.start(difficulty, seed, pickup, mode);
  let judged = 0, ready = 0, afterglow = NaN;
  const seen = new Set<string>();
  for (let frame = 0; sim.phase === 'playing' && frame <= 144 / STEP + 2; frame++) {
    const encountered = sim.gatesJudged + (sim.encore?.encountered ?? 0);
    if (encountered !== judged) { judged = encountered; ready = sim.time + .15; }
    const next = sim.previewGates.find(item => !item.judged);
    const encore = sim.previewEncore.find(item => !item.judged);
    const choosing = sim.routeGuide && !sim.branch?.side && (!next || next.worldStation >= sim.junctionPath!.end);
    const grabbing = pickup && sim.pickup?.status === 'pending' && sim.distance < sim.pickupStation && (!next || next.worldStation > sim.pickupStation);
    if (next && !choosing) {
      expect(next.axis).toBe(0);
      seen.add(`${next.kind}:${next.open}`);
    }
    const gate = next ?? encore;
    const target = choosing ? [side === 'center' ? 0 : side === 'left' ? -3.3 : 3.3, 0] : grabbing ? [0, 0]
      : gate && sim.time >= ready ? lanePoint(gate.kind, gate.open, gate.axis) : null;
    const axis = (coordinate: 0 | 1, value: number) => target ? clamp((target[coordinate] - value) / (6.2 * STEP), -1, 1) : 0;
    const boosting = motion === 'boost' || (motion === 'intermittent' && sim.time > 94 && frame % 120 < 70);
    sim.step(STEP, { ...idleInput, axisX: axis(0, sim.camera.tx), axisY: axis(1, sim.camera.ty), boosting },
      neutralizeEncore && sim.gatesJudged === sim.gatesTotal);
    if (!Number.isFinite(afterglow) && sim.outroPhase === 'afterglow') afterglow = sim.time;
  }
  return { sim, seen, afterglow };
}

test.each(difficulties)('%s clears Main through actual steering at cruise and sustained Boost', difficulty => {
  for (const motion of ['cruise', 'boost'] as const) {
    const { sim, seen } = fly(difficulty, motion);
    expect(sim.maxLives).toBe({ easy: 3, normal: 2, hard: 1 }[difficulty]);
    expect(sim.result, motion).toMatchObject({ title: 'ESCAPED', route: 'main', accuracy: 1, unreached: 0 });
    expect(sim.hits).toBe(0);
    expect(sim.beat).toBe(288);
    if (motion === 'cruise') expect(sim.encore).toBeUndefined();
    const expected = new Set(chartFor(volume, difficulty).map(gate => `${gate.kind}:${gate.sector}`));
    expect(seen).toEqual(expected);
    expect(seen.size).toBe(10);
  }
});

test('cruise and sustained Boost fade continuously over the last twelve musical beats', () => {
  for (const boosting of [false, true]) {
    const sim = new Simulation(volume, { align: true });
    sim.start('normal');
    let previous = 0;
    while (sim.phase === 'playing') {
      sim.step(STEP, { ...idleInput, boosting });
      expect(sim.escapeWhite).toBeGreaterThanOrEqual(previous);
      expect(sim.escapeWhite - previous).toBeLessThan(.005);
      if (sim.beat <= 276) expect(sim.escapeWhite).toBe(0);
      previous = sim.escapeWhite;
    }
    expect(previous).toBe(1);
  }
});

test('both three-dimensional branch layouts and all route gates clear under sustained Boost', () => {
  for (const seed of [0, 1]) for (const side of routeSides) {
    const { sim, afterglow } = fly('hard', 'boost', side, seed);
    const route = branchLayout(seed)[side];
    expect(sim.result, `${seed}/${side} last miss ${sim.mainGates.find(gate => gate.hit)?.beat}`).toMatchObject({
      title: 'ESCAPED', route, passed: { main: 120, challenge: 121, score: 131 }[route], accuracy: 1, unreached: 0,
    });
    const path = sim.junctionPath!;
    const station = (path.open + path.merge) / 2;
    const center = path.sample(station, 'center'), branch = path.sample(station, side);
    expect(branch.p.y - center.p.y).toBeCloseTo(side === 'center' ? 0 : 3.2);
    expect(path.stationAt(path.arcAt(station, side), side)).toBeCloseTo(station, 7);
    for (const seam of [path.split, path.end]) {
      expect(path.sample(seam, side).p.distanceTo(path.sample(seam, 'center').p)).toBeLessThan(1e-7);
      expect(path.sample(seam + .01, side).f.distanceTo(path.sample(seam - .01, side).f)).toBeLessThan(1e-5);
    }
    const plan = sim.outroPlan!;
    expect(sim.encore?.passed, `${seed}/${side}`).toBe(plan.gates.length);
    expect(sim.encore?.bonusScore).toBe(plan.gates.length * 300);
    expect(144 - afterglow).toBeGreaterThanOrEqual(10 - STEP);
    expect(144 - afterglow).toBeLessThan(12.2);
    expect(sim.escapeWhite).toBe(1);
    if (side === 'center') console.log('DAYBREAK', { seed, lastMain: sim.mainGates.at(-1)?.crossedAt,
      mainStation: plan.mainLastStation, count: plan.gates.length, first: plan.gates[0].worldStation,
      last: plan.gates.at(-1)?.worldStation, afterglow, path: sim.path.length });
  }
});

test('the pickup deck, partial Encore, recovery and Sightseeing retain their separate rules', () => {
  for (const pickup of ['shield', 'resonance', 'lumen'] as const) {
    const { sim } = fly('normal', 'intermittent', 'center', 0, 'standard', pickup);
    expect(sim.pickup).toEqual({ kind: pickup, status: 'collected' });
    expect(sim.result).toMatchObject({ title: 'ESCAPED', accuracy: 1, passed: 120, rank: 'S' });
    expect(sim.encore?.passed ?? 0).toBeGreaterThan(0);
    expect(sim.encore?.passed).toBeLessThan(sim.outroPlan!.gates.length);
  }
  const recovery = fly('normal', 'boost', 'center', 0, 'standard', undefined, true).sim;
  expect(recovery.result).toMatchObject({ accuracy: 1, passed: 120, rank: 'S' });
  expect(recovery.encore).toMatchObject({ neutralized: recovery.outroPlan!.gates.length, bonusScore: 0 });
  expect(recovery.lives).toBe(2);
  const scenic = fly('normal', 'cruise', 'right', 0, 'sightseeing').sim;
  expect(scenic.outroPlan?.gates).toEqual([]);
  expect(scenic.result).toMatchObject({ title: 'ESCAPED', route: 'challenge', rank: 'S', accuracy: 1 });
});

test('five, fifteen and thirty-minute menu and results positions stay inside their paths', () => {
  for (const mode of ['standard', 'sightseeing'] as const) {
    const menu = new Simulation(volume, {}, undefined, mode);
    const { sim: results } = fly('normal', 'boost', 'center', 0, mode);
    while (results.phase === 'crash') results.step(STEP, idleInput);
    const end = results.trackDistance;
    let previous = 0;
    for (const minutes of [5, 15, 30]) {
      for (let second = previous * 60; second < minutes * 60; second++) {
        menu.step(1, idleInput);
        const station = menu.trackDistance;
        menu.path.extendMenu(station + 640, station - 300);
        results.step(1, idleInput);
      }
      previous = minutes;
      for (const sim of [menu, results]) {
        const frame = sim.path.sample(sim.trackDistance, pathFrame());
        expect(sim.trackDistance + 430).toBeLessThan(sim.path.length);
        expect([...frame.p, ...frame.f, ...frame.r, ...frame.u].every(Number.isFinite)).toBe(true);
      }
      expect(results.trackDistance - end).toBeCloseTo(9, 6);
      expect(results.phase).toBe('results');
      expect(menu.phase).toBe('menu');
    }
  }
});

test('DAYBREAK sightseeing keeps five lives, one-third speed, and its lighter chart', () => {
  const standard = new Simulation(volume);
  const sightseeing = new Simulation(volume, {}, undefined, 'sightseeing');
  standard.start('normal');
  sightseeing.start('normal', undefined, undefined, 'sightseeing');
  expect(sightseeing.lives).toBe(5);
  expect(sightseeing.speed).toBeCloseTo(standard.speed / 3);
  expect(sightseeing.gatesTotal).toBe(39);
});
