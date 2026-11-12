import { expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import type { Difficulty } from '../../app/game/contracts';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import type { RouteSide } from '../../app/game/core/branches';
import { chartFor, difficultySettings } from '../../app/game/core/chart';
import { FixedStepClock, STEP } from '../../app/game/core/clock';
import { lanePoint } from '../../app/game/core/collision';
import { idleInput } from '../../app/game/core/input';
import type { InputFrame } from '../../app/game/core/input';
import { PICKUP_BEAT, pickupForSeed } from '../../app/game/core/pickups';
import type { PickupKind } from '../../app/game/core/pickups';
import { createRunSeed, runRandomWord } from '../../app/game/core/run-seed';
import { Simulation } from '../../app/game/core/simulation';
import { sectionAt, volumeById, VOLUMES } from '../../app/game/core/volumes';

const volume = volumeById('elsewhere');
const kinds = ['shield', 'resonance', 'lumen'] as const;
const previousGate = 303.99;
const nextGate = 309.32;
const scores = { easy: 66201, normal: 105326, hard: 156826 };
const lumen = { easy: 2500, normal: 5000, hard: 7500 };

function seedFor(kind: PickupKind) {
  const seed = Array.from({ length: 30 }, (_, i) => i).find(seed => pickupForSeed(seed) === kind);
  if (seed === undefined) throw new Error(`No test seed for ${kind}`);
  return seed;
}

function advance(sim: Simulation, beat: number, input: InputFrame = idleInput) {
  const station = sim.reference.station(beat, sim.mode);
  const reached = () => beat === sim.volume.beats ? sim.beat === beat : sim.trackDistance + 1e-8 >= station;
  while (!reached() && sim.phase === 'playing') sim.step(STEP, input);
  expect(reached()).toBe(true);
}

function start(kind: PickupKind, difficulty: Difficulty = 'normal', boost = false) {
  const flags: { align: boolean; branchSide?: RouteSide } = { align: true };
  const sim = new Simulation(volume, flags);
  sim.start(difficulty, seedFor(kind));
  const input = { ...idleInput, boosting: boost };
  // Leave the Diamond opening and wait 150 ms before moving toward the pickup.
  advance(sim, previousGate, input);
  flags.align = false;
  const ready = sim.time + 0.15;
  while (sim.time + 1e-9 < ready) sim.step(STEP, input);
  return { sim, flags, input };
}

function collect(run: ReturnType<typeof start>, end = PICKUP_BEAT) {
  const { sim, input } = run;
  while (sim.trackDistance + 1e-8 < sim.reference.station(end, sim.mode) && sim.phase === 'playing') {
    sim.step(STEP, { ...input, axisY: sim.camera.ty < 0.95 ? 1 : 0 });
  }
}

test('seeded pickup selection covers all kinds and does not change the authored gates', () => {
  const counts = { shield: 0, resonance: 0, lumen: 0 };
  for (let seed = 0; seed < 3000; seed++) counts[pickupForSeed(seed)]++;
  for (const count of Object.values(counts)) expect(count).toBeGreaterThan(900);
  expect(new Set(Array.from({ length: 96 }, () => pickupForSeed(createRunSeed()))).size).toBe(3);
  const sim = new Simulation(volume, { align: true });
  const firstGates: string[] = [];
  for (const kind of kinds) {
    const seed = seedFor(kind);
    const unrelated = runRandomWord(seed, 0x54455354);
    for (let attempt = 0; attempt < 2; attempt++) {
      sim.start('hard', seed);
      expect(sim.pickup).toEqual({ kind, status: 'pending' });
      expect(runRandomWord(seed, 0x54455354)).toBe(unrelated);
      advance(sim, 10);
      firstGates.push(JSON.stringify(sim.previewGates));
      sim.returnToMenu();
      expect(sim.pickup).toBeNull();
    }
  }
  expect(new Set(firstGates).size).toBe(1);
  for (const other of VOLUMES.filter(other => other !== volume)) {
    const run = new Simulation(other, { align: true });
    run.start('normal', seedFor('lumen'));
    advance(run, other.beats);
    expect(run.pickup).toBeNull();
    expect(run.shield).toBe(false);
    expect(run.resonance).toBe(0);
  }
});

test.each(difficulties)('%s places one pickup between the BREAK gates without adding a chart entry', difficulty => {
  const chart = chartFor(volume, difficulty);
  const next = chart.findIndex(gate => gate.beat >= PICKUP_BEAT);
  expect(sectionAt(volume, PICKUP_BEAT)?.name).toBe('BREAK');
  expect([chart[next - 1].beat, chart[next].beat]).toEqual([previousGate, nextGate]);
  expect((PICKUP_BEAT - previousGate) * 60 / volume.bpm).toBeCloseTo(1.25, 2);
  expect((nextGate - PICKUP_BEAT) * 60 / volume.bpm).toBeCloseTo(1.25, 2);
});

test.each([{ from: 0.2, to: 0.31, status: 'missed' }, { from: 0.4, to: 0.29, status: 'collected' }] as const)(
  'pickup uses the interpolated position, $from → $to is $status', ({ from, to, status }) => {
    const { sim, input } = start('lumen');
    advance(sim, PICKUP_BEAT - STEP / sim.secondsPerBeat, input);
    sim.distance = sim.pickupStation - sim.speed * STEP * 0.4;
    expect(sim.pickup?.status).toBe('pending');
    expect(sim.camera.x).toBeCloseTo(0, 8);
    sim.camera.y = from;
    const damp = 1 - Math.exp(-STEP * 20);
    sim.step(STEP, { ...input, target: [0, from + (to - from) / damp] });
    expect(sim.camera.y).toBeCloseTo(to, 8);
    expect(sim.pickup?.status).toBe(status);
  },
);

test('missing the pickup is permanent and has no gameplay effect', () => {
  const { sim, input } = start('lumen');
  const before = { score: sim.score, distance: sim.distance, lives: sim.lives, combo: sim.combo, judged: sim.gatesJudged };
  advance(sim, PICKUP_BEAT + 1, input);
  expect(sim.pickup).toEqual({ kind: 'lumen', status: 'missed' });
  expect(sim.score - before.score).toBeCloseTo((sim.distance - before.distance) * 0.35, 8);
  expect([sim.lives, sim.combo, sim.gatesJudged, sim.shield, sim.resonance])
    .toEqual([before.lives, before.combo, before.judged, false, 0]);
  advance(sim, PICKUP_BEAT + 2, { ...input, target: [0, 1] });
  expect(sim.pickup?.status).toBe('missed');
});

test('Shield saves one life, breaks Combo, counts the misses and starts normal immunity', () => {
  const run = start('shield');
  const { sim, flags, input } = run;
  collect(run);
  expect(sim.message).toBe('PRISM SHIELD');
  expect(sim.shield).toBe(true);
  flags.align = true;
  const chart = chartFor(volume, 'normal');
  const beforeMiss = chart.findIndex(gate => gate.beat === 383);
  advance(sim, chart[beforeMiss - 1].beat, input);
  const { lives, gatesPassed, gatesJudged } = sim;
  flags.align = false;
  advance(sim, 383, { ...input, target: [0, 0] });
  expect([sim.shield, sim.lives, sim.hits, sim.combo, sim.gatesPassed, sim.gatesJudged])
    .toEqual([false, lives, 0, 0, gatesPassed, gatesJudged + 1]);
  advance(sim, 384, input);
  expect([sim.lives, sim.hits, sim.gatesPassed, sim.gatesJudged]).toEqual([lives, 0, gatesPassed, gatesJudged + 2]);
  const after = chart[beforeMiss + 2];
  advance(sim, after.beat, { ...input, target: after.kind === 'iris' ? [0, 0] : [2.6, 0] });
  expect([sim.lives, sim.hits, sim.gatesPassed, sim.gatesJudged])
    .toEqual([lives - 1, 1, gatesPassed, gatesJudged + 3]);
  flags.align = true;
  advance(sim, volume.beats, input);
  const total = chart.length - 3; // Main replaces 11 gates with 8.
  expect(sim.result?.accuracy).toBe((total - 3) / total);
});

test('a miss already covered by immunity leaves the Shield ready', () => {
  const run = start('shield');
  collect(run);
  const { sim, input } = run;
  const lives = sim.lives;
  // This overlap does not occur in the current chart. Supply an active damage cooldown to test its precedence.
  Reflect.set(sim, 'invulnUntil', nextGate * sim.secondsPerBeat + 0.1);
  advance(sim, nextGate, { ...input, target: [0, 0] });
  expect([sim.shield, sim.lives, sim.combo, sim.gatesJudged - sim.gatesPassed]).toEqual([true, lives, 0, 1]);
});

test('Shield protects a failed Challenge gate without changing the selected chart', () => {
  const run = start('shield');
  const { sim, flags, input } = run;
  collect(run);
  const layout = branchLayout(seedFor('shield'));
  flags.branchSide = routeSides.find(side => layout[side] === 'challenge');
  flags.align = true;
  advance(sim, 320, input);
  const { lives, gatesJudged, gatesPassed } = sim;
  flags.align = false;
  advance(sim, 326, { ...input, target: [0, 0] });
  expect([sim.route, sim.gatesTotal, sim.lives, sim.shield, sim.combo, sim.gatesJudged, sim.gatesPassed])
    .toEqual(['challenge', 145, lives, false, 0, gatesJudged + 1, gatesPassed]);
});

test('Lumen adds the same fixed amount on the Score route', () => {
  const run = start('lumen');
  const { sim, flags, input } = run;
  collect(run);
  const layout = branchLayout(seedFor('lumen'));
  flags.branchSide = routeSides.find(side => layout[side] === 'score');
  flags.align = true;
  advance(sim, volume.beats, input);
  expect([sim.route, sim.gatesPassed, Math.floor(sim.score)]).toEqual(['score', 157, 111406 + 5000]);
});

test('Resonance adds 25% to eight successful gate awards, including Boost and CLEAN only when earned', () => {
  const run = start('resonance', 'normal', true);
  const { sim, flags, input } = run;
  const chart = chartFor(volume, 'normal');
  const mult = difficultySettings(volume, 'normal').mult;
  collect(run);
  expect(sim.message).toBe('RESONANCE ×8');
  expect(sim.resonance).toBe(8);
  const first = chart.find(gate => gate.beat === nextGate)!;
  const [x, y] = lanePoint(first.kind, first.sector, 0);
  function scoreTo(beat: number, control: InputFrame) {
    const { score, distance } = sim;
    advance(sim, beat, control);
    return sim.score - score - (sim.distance - distance) * 0.35;
  }
  expect(scoreTo(PICKUP_BEAT + 1, { ...input, target: [x * 0.53, y * 0.53] })).toBeCloseTo(0, 8);
  expect(scoreTo(nextGate, input)).toBeCloseTo(100 * mult * 1.5 * 3.5 * 1.25, 8);
  expect(sim.resonance).toBe(7);
  expect(scoreTo(314.65, { ...input, target: [2.6, 0] })).toBeCloseTo(0, 8);
  expect([sim.resonance, sim.combo, sim.gatesJudged - sim.gatesPassed]).toEqual([7, 0, 1]);
  const layout = branchLayout(seedFor('resonance'));
  flags.branchSide = routeSides.find(side => layout[side] === 'challenge');
  flags.align = true;
  advance(sim, 320, input);
  expect(sim.route).toBe('challenge');
  for (let passed = 1; passed <= 8; passed++) {
    const earned = scoreTo(326 + 2 * (passed - 1), input);
    const normal = (100 * 1.5 * (1 + passed * 0.05) + 150) * mult * 2;
    expect(earned).toBeCloseTo(normal * (passed <= 7 ? 1.25 : 1), 8);
    expect(sim.resonance).toBe(Math.max(7 - passed, 0));
  }
});

test('terminating a run discards unused Resonance charges', () => {
  const run = start('resonance', 'hard');
  collect(run);
  expect(run.sim.resonance).toBe(8);
  advance(run.sim, nextGate, { ...run.input, target: [0, 0] });
  expect([run.sim.result?.title, run.sim.resonance]).toEqual(['TERMINATED', 0]);
});

test.each(difficulties)('%s Lumen awards exactly the fixed points once, even during Boost', difficulty => {
  const run = start('lumen', difficulty, true);
  const { sim, input } = run;
  const { score, distance, combo, lives, gatesJudged } = sim;
  collect(run);
  expect(sim.message).toBe(`LUMEN +${lumen[difficulty]}`);
  expect([sim.combo, sim.lives, sim.gatesJudged]).toEqual([combo, lives, gatesJudged]);
  advance(sim, PICKUP_BEAT + 1, input);
  expect(sim.score - score - (sim.distance - distance) * 0.35).toBeCloseTo(lumen[difficulty], 8);
});

test.each(difficulties.flatMap(difficulty => kinds.map(kind => ({ difficulty, kind }))))(
  '$difficulty completes every gate with $kind collected', ({ difficulty, kind }) => {
    const run = start(kind, difficulty);
    const { sim, flags, input } = run;
    collect(run);
    expect(sim.pickup?.status).toBe('collected');
    flags.align = true;
    advance(sim, volume.beats, input);
    for (let i = 0; i < 45; i++) sim.step(STEP, input);
    const bonus = kind === 'lumen' ? lumen[difficulty]
      : kind === 'resonance' ? 1000 * difficultySettings(volume, difficulty).mult : 0;
    expect(Math.floor(sim.score)).toBe(scores[difficulty] + bonus);
    expect(sim.gatesPassed).toBe(chartFor(volume, difficulty).length - 3);
    expect(sim.result).toMatchObject({ title: 'ESCAPED', accuracy: 1, rank: 'S', route: 'main', unreached: 0 });
    expect([sim.phase, sim.shield, sim.resonance]).toEqual(['results', false, 0]);
    expect(sim.start(difficulty, seedFor('lumen'))).toBe(true);
    expect([sim.pickup, sim.score, sim.shield, sim.resonance]).toEqual([
      { kind: 'lumen', status: 'pending' }, 0, false, 0,
    ]);
  },
);

test('pickup crossings give the same result at 20, 60, 120 and 144 Hz', () => {
  function runAt(hz: number) {
    const { sim, input } = start('lumen');
    const clock = new FixedStepClock();
    for (let frame = 1; frame <= hz * 1.5; frame++) {
      clock.consume(frame / hz, () => sim.step(STEP, { ...input, axisY: sim.camera.ty < 0.95 ? 1 : 0 }));
    }
    return [sim.pickup, sim.camera, sim.score, sim.lives];
  }
  const reference = runAt(60);
  expect(reference[0]).toEqual({ kind: 'lumen', status: 'collected' });
  for (const hz of [20, 120, 144]) expect(runAt(hz)).toEqual(reference);
});
