import { expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { branchDistance, branchLayout, BRANCH_OPEN_BEAT, BRANCH_PREVIEW_BEAT, BRANCH_SIDE_THRESHOLD, BRANCH_SPACING, MERGE_BEAT, REJOIN_BEAT,
  ROUTE_GATE_MULTIPLIERS, routeCharts, routeSides, selectSide, SPLIT_BEAT } from '../../app/game/core/branches';
import type { RouteSide } from '../../app/game/core/branches';
import { chartFor } from '../../app/game/core/chart';
import { FixedStepClock, STEP } from '../../app/game/core/clock';
import { lanePoint, opening, SECTION } from '../../app/game/core/collision';
import { idleInput } from '../../app/game/core/input';
import { pickupForSeed } from '../../app/game/core/pickups';
import { corridorLength, Simulation } from '../../app/game/core/simulation';
import type { RunGate } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { BranchPath } from '../../app/game/graphics/branch-path';
import { buildPath } from '../../app/game/graphics/path';

const volume = volumeById('elsewhere');
const layoutSeeds = [
  Array.from({ length: 32 }, (_, i) => i).find(seed => branchLayout(seed).left === 'challenge')!,
  Array.from({ length: 32 }, (_, i) => i).find(seed => branchLayout(seed).right === 'challenge')!,
];
const routeBeats = {
  main: [326, 329, 332, 335, 338, 341, 344, 347],
  challenge: [326, 328, 330, 332, 334, 336, 338, 340, 342, 344, 346, 348],
  score: Array.from({ length: 24 }, (_, i) => 326 + i),
};
const counts = { easy: [140, 144, 156], normal: [141, 145, 157], hard: [141, 145, 157] };
const scores = { easy: [66201, 74201, 70001], normal: [105326, 118126, 111406], hard: [156826, 176026, 165946] };
const kinds = ['main', 'challenge', 'score'] as const;
const inside = (beat: number) => beat >= SPLIT_BEAT && beat < REJOIN_BEAT;
const axis = (delta: number) => Math.abs(delta) < 0.05 ? 0 : Math.sign(delta);

test('one seed keeps both streams reproducible while layout varies independently of pickup kind', () => {
  const counts = { left: 0, right: 0 };
  const pairings = new Set<string>();
  for (let seed = 0; seed < 512; seed++) {
    const pickup = pickupForSeed(seed);
    const layout = branchLayout(seed);
    const side = layout.left === 'challenge' ? 'left' : 'right';
    counts[side]++;
    pairings.add(side + pickup);
    expect(layout.center).toBe('main');
    expect(pickupForSeed(seed)).toBe(pickup);
    expect(branchLayout(seed)).toEqual(layout);
  }
  expect(counts.left).toBeGreaterThan(220);
  expect(counts.right).toBeGreaterThan(220);
  expect(pairings.size).toBe(6);
  const sim = new Simulation(volume);
  for (const seed of layoutSeeds) {
    sim.start('normal', seed);
    expect(sim.branch?.layout).toEqual(branchLayout(seed));
    expect(sim.branch?.side).toBeNull();
    sim.returnToMenu();
    expect(sim.branch).toBeNull();
  }
});

test.each([[-2.4, 'left'], [-2.399, 'center'], [0, 'center'], [2.399, 'center'], [2.4, 'right']] as const)(
  'x=%s selects %s', (x, side) => expect(selectSide(x)).toBe(side),
);

test('the split uses the position at the crossing, not the end of the tick', () => {
  const options = { align: true };
  const sim = new Simulation(volume, options);
  sim.start('normal');
  while (sim.beat < 319.95) sim.step(STEP, idleInput);
  options.align = false;
  // Fractional initial offset makes the crossing internal to the tick.
  sim.beat = 319.988;
  sim.camera.x = 2.37;
  sim.camera.tx = 2.37 + 0.06 / (1 - Math.exp(-20 * STEP));
  sim.step(STEP, idleInput);
  expect(sim.camera.x).toBeGreaterThan(BRANCH_SIDE_THRESHOLD);
  expect(sim.branch?.side).toBe('center');
  while (sim.beat < 322) sim.step(STEP, { ...idleInput, target: [-2.6, 0] });
  expect(sim.branch?.side).toBe('center');
});

test.each(['keyboard', 'mouse', 'touch'] as const)('%s can traverse the widened hall and transfers into a normal tunnel', control => {
  const flags = { align: true };
  const sim = new Simulation(volume, flags);
  sim.start('hard', 0);
  while (sim.beat < BRANCH_PREVIEW_BEAT) sim.step(STEP, idleInput);
  flags.align = false;
  expect(sim.camera.x).toBeCloseTo(0, 1);
  while (sim.beat + STEP / sim.secondsPerBeat < SPLIT_BEAT) {
    sim.step(STEP, { ...idleInput, axisX: control === 'keyboard' ? -1 : 0,
      target: control === 'mouse' ? [-3.4, 0] : null, dragX: control === 'touch' ? -0.006 : 0 });
  }
  expect(sim.camera.x).toBeLessThan(-6);
  while (sim.beat < BRANCH_OPEN_BEAT) {
    const x = sim.camera.x;
    sim.step(STEP, idleInput);
    expect(Math.abs(sim.camera.x - x)).toBeLessThan(0.4);
  }
  expect(sim.branch?.side).toBe('left');
  expect(Math.abs(sim.camera.x)).toBeLessThanOrEqual(SECTION.a - 0.34 + 1e-8);
  expect(sim.steeringWidth).toBe(0);
  expect(sim.gatesJudged).toBe(94);
});

test.each(difficulties.flatMap(difficulty => layoutSeeds.flatMap(seed => kinds.map(route => ({ difficulty, seed, route })))))(
  '$difficulty $route seed $seed clears with a 150 ms reaction and normal collisions', ({ difficulty, seed, route }) => {
    const sim = new Simulation(volume);
    const layout = branchLayout(seed);
    const side = routeSides.find(side => layout[side] === route)!;
    const prefix = chartFor(volume, difficulty).filter(gate => gate.beat < SPLIT_BEAT);
    const suffix = chartFor(volume, difficulty).filter(gate => gate.beat >= REJOIN_BEAT);
    const replaced = chartFor(volume, difficulty).filter(gate => inside(gate.beat));
    const chosen = routeCharts(replaced)[route];
    expect(replaced).toHaveLength(11);
    expect(chosen.map(gate => gate.beat)).toEqual(routeBeats[route]);
    expect(chosen.map(gate => gate.kind[0]).join('')).toBe(
      route === 'main' ? 'iisidiis' : route === 'challenge' ? 'iiisiiidiiii' : 'sd'.repeat(12));
    const chart = [...prefix, ...chosen, ...suffix];
    sim.start(difficulty, seed);
    expect(sim.gatesTotal).toBe(prefix.length + suffix.length);
    const ticks = Math.ceil((volume.beats * sim.secondsPerBeat + 0.8) / STEP);
    for (let i = 0; i < ticks; i++) {
      const before = sim.gatesJudged;
      const next = chart[before];
      const last = chart[before - 1];
      let input = idleInput;
      if (next && (!last || (sim.beat - last.beat) * sim.secondsPerBeat >= 0.150 - 1e-9)) {
        const [x, y] = !sim.branch?.side && before >= prefix.length
          ? [side === 'left' ? -3.2 : side === 'right' ? 3.2 : 0, 0] : lanePoint(next.kind, next.sector, 0);
        input = { ...idleInput, axisX: axis(x - sim.camera.tx), axisY: axis(y - sim.camera.ty) };
      }
      sim.step(STEP, input);
      if (sim.gatesJudged !== before) {
        expect(sim.beat - next.beat).toBeGreaterThanOrEqual(-1e-8);
        expect(sim.beat - next.beat).toBeLessThan(STEP / sim.secondsPerBeat + 1e-8);
        expect(sim.gatesPassed, `${last?.beat ?? 'start'} → ${next.beat}`).toBe(before + 1);
      }
    }
    const liveChart = Reflect.get(sim, 'chart') as RunGate[];
    expect(liveChart.map(({ beat, kind, open }) => [beat, kind, open])).toEqual(
      chart.map(({ beat, kind, sector }) => [beat, kind, opening(kind, sector)]));
    for (const other of kinds.filter(kind => kind !== route)) expect(sim.branchGates![other].every(gate => !gate.judged)).toBe(true);
    const n = counts[difficulty][kinds.indexOf(route)];
    expect([sim.gatesTotal, sim.gatesJudged, sim.gatesPassed, sim.maxCombo, sim.hits, sim.lives])
      .toEqual([n, n, n, n, 0, volume.lives[difficulty]]);
    expect(Math.floor(sim.score)).toBe(scores[difficulty][kinds.indexOf(route)]);
    expect(sim.phase).toBe('results');
    expect(sim.result).toEqual({ title: 'ESCAPED', accuracy: 1, rank: 'S', route });
  },
);

test('route rewards are ordered for all-CLEAN play at the combo cap', () => {
  const rewards = kinds.map(kind => routeBeats[kind].length * ROUTE_GATE_MULTIPLIERS[kind] * (350 + 150));
  expect(rewards.map(Math.round)).toEqual([4000, 12000, 7800]);
});

test('fixed clock gives the same selection and gate results at 20–144 Hz', () => {
  const run = (hz: number, side?: RouteSide) => {
    const sim = new Simulation(volume, { align: true, branchSide: side });
    const clock = new FixedStepClock();
    sim.start('normal', layoutSeeds[0]);
    for (let frame = 1; frame <= hz * 169; frame++) {
      clock.consume(frame / hz, () => sim.step(STEP, idleInput));
    }
    return [sim.branch, sim.gatesJudged, sim.score, sim.lives];
  };
  expect(run(60)[0]).toMatchObject({ side: 'center' });
  const reference = run(60, 'left');
  for (const hz of [20, 120, 144]) expect(run(hz, 'left')).toEqual(reference);
});

test.each(['cruise', 'boost', 'toggle'] as const)('%s keeps the camera path continuous and gates fixed to their road', mode => {
  const base = buildPath(corridorLength(volume));
  const sim = new Simulation(volume, { align: true, branchSide: 'right' });
  sim.start('normal');
  let path: BranchPath | undefined;
  let previous = base.sample(sim.distance);
  while (sim.beat < 360) {
    const boost = mode === 'boost' || (mode === 'toggle' && sim.beat >= 321 && sim.beat < 353);
    sim.step(STEP, { ...idleInput, boosting: boost });
    if (sim.branch?.anchor && !path) path = new BranchPath(base, sim.branch.anchor);
    const camera = path ? path.sample(sim.trackDistance, sim.branch?.side ?? 'center') : base.sample(sim.trackDistance);
    expect(camera.p.distanceTo(previous.p)).toBeLessThan(1.2);
    expect(camera.f.angleTo(previous.f)).toBeLessThan(0.09);
    previous = camera;
    if (path && sim.beat >= SPLIT_BEAT && sim.beat < REJOIN_BEAT) {
      expect(sim.trackDistance).toBeCloseTo(path.distanceAt(sim.beat), 8);
      const next = sim.previewGates.find(gate => gate.route && !gate.judged);
      if (next) expect(sim.projectTrack(next.beat)).toBeCloseTo(path.distanceAt(next.beat), 8);
    }
  }
  const track = path!;
  expect(track.split).toBeCloseTo(branchDistance(sim.branch!.anchor!, SPLIT_BEAT), 8);
  for (const beat of [BRANCH_OPEN_BEAT, 326, 336, MERGE_BEAT]) {
    const s = track.distanceAt(beat);
    const center = track.sample(s, 'center');
    const left = track.sample(s, 'left');
    const right = track.sample(s, 'right');
    expect(center.p.distanceTo(left.p)).toBeCloseTo(BRANCH_SPACING, 8);
    expect(center.p.distanceTo(right.p)).toBeCloseTo(BRANCH_SPACING, 8);
    expect(right.p.distanceTo(left.p)).toBeGreaterThan(SECTION.a * 4);
    expect(center.p.distanceTo(base.sample(s).p)).toBe(0);
  }
  for (const beat of [BRANCH_PREVIEW_BEAT, SPLIT_BEAT, REJOIN_BEAT]) {
    const s = track.distanceAt(beat);
    for (const side of routeSides) {
      expect(track.sample(s, side).p.distanceTo(base.sample(s).p)).toBe(0);
      expect(track.sample(s, side).f.angleTo(base.sample(s).f)).toBeLessThan(1e-7);
    }
  }
});
