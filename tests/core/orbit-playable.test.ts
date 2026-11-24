import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import { buildChart, chartFor, difficultySettings } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, lanePoint } from '../../app/game/core/collision';
import { orbitChart, orbitRouteCharts, orbitReferenceChart, orbitCueBeats } from '../../app/game/core/orbit-chart';
import { apertureAnchors, isOrbitGate, orbitPreset } from '../../app/game/core/orbit-gates';
import { difficultiesFor } from '../../app/game/core/difficulty';
import { idleInput, steer, steeringDamping } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { referenceMotion } from '../../app/game/core/reference-motion';
import { START_DISTANCE } from '../../app/game/core/reference-track';
import { starwakeTrack } from '../../app/game/core/orbit-score';
import type { ChartGate } from '../../app/game/core/chart';
import { OutroInspection } from '../../app/game/debug/outro-inspection';

const orbit = volumeById('orbit');
const axis = (delta: number) => Math.abs(delta) < .052 ? 0 : Math.sign(delta);

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const withoutMarker = ({ inserted, ...gate }: ChartGate) => gate;
const standardDifficulties = ['easy', 'normal', 'hard'] as const;
const standardRouteTotals = { main: 92, challenge: 93, score: 89 };
const impossibleRouteTotals = { main: 135, challenge: 136, score: 129 };

// Complete chart and route descriptors captured at 654f022 before Easy parity.
const baseline = {
  hard: 'e647f06fdbc9c793fe3cb6af9bcc4d3691b4f48563f916cbfce797ef698533ca',
  impossible: '68940a3c06d8277450e7e51c408b8b273d7af2964b1f3b76fea0698982ae7a57',
  challenge: '3489b37558838be80c5f32865e6342c80f37978cafd10ee9d684e0b872d071d3',
  impossibleChallenge: 'f09ae06bcc1fa1447eb6cc1409cdb583e24dba2c9ede2ebb311d177c96913101',
  bonus: '4d7fc3784bab70f515eb78c52085874a8dd187a02780401791f6767d2febd59e',
  sightseeing: '17992dd21325ba04cb72af8a523bf78591786beef13e416363d907134c52fd59',
  cues: '0423d862a547e4929544c79ece3ea2b596b2260e2dc7a130f94c633488b6ef1d',
};

// Frozen 2ec9709 anchors: compare their complete descriptors, not just counts.
const priorBeats = [
  12, 20, 28, 32, 36, 40, 44, 48, 52, 56, 59.75, 63.625,
  68, 73, 77.5, 82, 85.75, 89.75, 94.5, 97, 101, 105, 128, 132,
  135.5, 138.75, 142, 146, 158.5, 160.75, 164, 167.375, 171, 175, 178, 181,
  184, 187, 190, 192.75, 196, 198.75, 202, 205, 207.8125, 211, 215, 219,
  222.75, 232, 244, 257, 261, 265, 269, 272, 275, 278, 281, 284,
  287, 290, 293, 296, 299, 302, 306, 309.5, 313, 317, 321, 325,
  329, 333, 337, 341, 345, 349, 354, 359, 364,
];
const priorInserts = [
  34, 38, 42, 46, 50, 54, 66, 70, 75, 80, 91.75, 99,
  103, 107, 130, 144, 173, 213, 217, 259, 263, 267, 304, 315,
  319, 323, 327, 331, 335, 339, 343, 347, 351,
];

test('ORBIT standard difficulties share the frozen Hard chart and all branches', () => {
  const hard = orbitChart('hard');
  const routes = orbitRouteCharts(hard, 'hard');
  expect(hash(hard)).toBe(baseline.hard);
  expect(hash(routes.challenge)).toBe(baseline.challenge);
  expect(hard).toHaveLength(92);
  expect(routes.challenge).toHaveLength(8);
  for (const difficulty of standardDifficulties) {
    const chart = orbitChart(difficulty);
    expect(chart).toEqual(hard);
    expect(chartFor(orbit, difficulty)).toEqual(hard);
    expect(orbitRouteCharts(chart, difficulty)).toEqual(routes);
  }
  expect(standardDifficulties.map(difficulty => difficultySettings(orbit, difficulty)))
    .toMatchObject([{ lives: 3, mult: 1, speedFactor: 1 }, { lives: 2, mult: 1.6, speedFactor: 1 },
      { lives: 1, mult: 2.4, speedFactor: 1 }]);
});

test('density reinforcement preserves previous openings, Impossible, Bonus and the motion/world reference', () => {
  const hard = orbitChart('hard'), impossible = orbitChart('impossible');
  expect(hash(hard.filter(g => priorBeats.includes(g.beat)).map(withoutMarker)))
    .toBe('b1a61c41145b57d4ecbd14f570c511b8f3fca110a7f2df435b88e20980063376');
  expect(hash(impossible.filter(g => [...priorBeats, ...priorInserts].includes(g.beat)).map(withoutMarker)))
    .toBe('ae9d82249553d3235f14340a6df774fee3091b15572fc90171db850b995aedb5');
  expect(hash(impossible)).toBe(baseline.impossible);
  expect(hash(orbitCueBeats)).toBe(baseline.cues);
  const reference = orbitReferenceChart();
  expect(hash(reference)).toBe('b1a61c41145b57d4ecbd14f570c511b8f3fca110a7f2df435b88e20980063376');
  for (const difficulty of [...standardDifficulties, 'impossible'] as const) {
    const isImpossible = difficulty === 'impossible';
    const chart = orbitChart(difficulty), routes = orbitRouteCharts(chart, difficulty);
    expect(starwakeTrack.sections.map(s => chart.filter(g => g.section === s.name).length))
      .toEqual(isImpossible ? [3, 33, 19, 29, 2, 30, 19] : [3, 19, 12, 22, 2, 22, 12]);
    expect(new Set(chart.map(g => g.beat)).size).toBe(chart.length);
    for (const route of Object.values(routes)) for (const g of route) {
      expect(orbitCueBeats).toContain(g.beat);
      expect(g.beat >= 108 && g.beat < 128 || g.beat >= 147 && g.beat < 158).toBe(false);
    }
    expect(hash(routes.challenge)).toBe(isImpossible ? baseline.impossibleChallenge : baseline.challenge);
    expect(hash(routes.score)).toBe(baseline.bonus);
    for (const mode of ['standard', 'sightseeing'] as const) {
      const sim = new Simulation(orbit); sim.start(difficulty, 0, undefined, mode);
      const motion = referenceMotion(384, 60 / 128, reference);
      for (const beat of [...priorBeats, 108, 120, 122, 128, 148, 156, 384]) {
        expect(sim.reference.station(beat, mode)).toBeCloseTo(START_DISTANCE + motion(beat)
          * (mode === 'sightseeing' ? 1 / 3 : 1) * (sim.difficulty === 'impossible' ? 1.15 : 1), 8);
      }
      if (mode === 'sightseeing') expect(hash([sim.mainGates, sim.branchGates])).toBe(baseline.sightseeing);
    }
  }
  expect(impossible).toHaveLength(135);
  expect(impossible.filter(g => g.inserted)).toHaveLength(43);
});

test('ORBIT owns STARWAKE and preserves Hard anchors outside safe junction windows', () => {
  expect(orbit).toMatchObject({ bpm: 128, beats: 384, music: 'starwake' });
  expect(buildChart(orbit)).not.toEqual(buildChart(volumeById('elsewhere')));
  expect(difficultiesFor('orbit')).toEqual(['easy', 'normal', 'hard', 'impossible']);
  expect(difficultySettings(orbit, 'impossible')).toMatchObject({ lives: 1, mult: 3.4, speedFactor: 1.15 });
  const hard = chartFor(orbit, 'hard'), impossible = chartFor(orbit, 'impossible');
  for (const chart of [hard, impossible]) for (const gate of chart) {
    expect(orbitCueBeats).toContain(gate.beat);
    expect(gate.beat).toBeLessThan(384);
  }
  expect(impossible.filter(gate => !gate.inserted)).toEqual(hard);
  expect(impossible.some(gate => gate.inserted)).toBe(true);
  expect(impossible.some(({ beat }) => beat >= 108 && beat < 128 || beat >= 147 && beat < 158)).toBe(false);
  expect(impossible.some(gate => gate.inserted && gate.beat >= 224 && gate.beat < 256)).toBe(false);
});

test.each([
  ['easy', 'standard', 'cruise'], ['easy', 'standard', 'boost'], ['easy', 'standard', 'mixed'],
  ['normal', 'standard', 'cruise'], ['normal', 'standard', 'boost'], ['normal', 'standard', 'mixed'],
  ['hard', 'standard', 'cruise'], ['hard', 'standard', 'boost'], ['hard', 'standard', 'mixed'],
  ['impossible', 'standard', 'cruise'], ['impossible', 'standard', 'boost'], ['impossible', 'standard', 'mixed'],
  ['normal', 'sightseeing', 'cruise'], ['normal', 'sightseeing', 'boost'], ['normal', 'sightseeing', 'mixed'],
] as const)('%s %s %s clears each route with keyboard steering and 150 ms reaction', (difficulty, mode, motion) => {
  expect(branchLayout(0)).not.toEqual(branchLayout(1));
  for (const seed of [0, 1]) for (const side of routeSides) {
    const sim = new Simulation(orbit);
    const kind = side === 'center' ? 'lumen' : side === 'left' ? 'resonance' : 'shield';
    sim.start(difficulty, seed, kind, mode);
    const route = branchLayout(seed)[side];
    const expectedTotals = difficulty === 'impossible' ? impossibleRouteTotals : standardRouteTotals;
    if (mode === 'standard') expect(sim.gatesTotal).toBe(expectedTotals.main);
    const plan = sim.outroPlan!;
    const branch = sim.junctionPath!;
    const lastApproach = sim.mainGates.filter(gate => gate.worldStation < branch.split).at(-1)!;
    const exit = sim.mainGates.find(gate => gate.worldStation >= branch.end)!;
    expect(lastApproach.worldStation).toBeLessThan(branch.guideStart);
    expect(exit.beat).toBeGreaterThanOrEqual(158);
    let lastCrossing = -Infinity, extra = 0, afterglowAt = 0, guideAt = 0, chosenAt = 0;
    while (sim.phase === 'playing') {
      const index = sim.gatesJudged;
      const gate = sim.mainGates[index] ?? plan.gates[extra];
      const choosing = !!sim.routeGuide && !sim.branch!.side;
      const pickup = sim.route === 'score' && sim.pickup?.status === 'pending' && sim.pickupStation - sim.trackDistance < (mode === 'sightseeing' ? 6 : 17)
        && sim.trackDistance < sim.pickupStation;
      if (choosing && !guideAt) guideAt = sim.time;
      let [x, y] = choosing ? [side === 'left' ? -3.2 : side === 'right' ? 3.2 : 0, 0]
        : pickup ? [0, 0] : gate ? lanePoint(gate.kind, gate.open, gate.axis) : [0, 0];
      const boosting = motion === 'boost' || (motion === 'mixed' && (sim.beat < 132 || (sim.beat > 260 && sim.beat < 282) || sim.trackDistance > plan.mainLastStation));
      const ready = sim.time - lastCrossing + 1e-9 >= .15;
      sim.step(STEP, { ...idleInput, boosting, axisX: ready ? axis(x - sim.camera.tx) : 0,
        axisY: ready ? axis(y - sim.camera.ty) : 0 });
      if (sim.gatesJudged > index) lastCrossing = gate.crossedAt!;
      else if (plan.gates[extra]?.judged) lastCrossing = plan.gates[extra++].crossedAt!;
      if (!chosenAt && sim.route) chosenAt = sim.time;
      if (!afterglowAt && sim.outroPhase === 'afterglow') afterglowAt = sim.time;
      if (!sim.lives) throw new Error(`${difficulty}/${mode}/${motion}/${seed}/${side} failed at beat ${gate?.beat}, camera ${JSON.stringify(sim.camera)}`);
    }
    if (mode === 'standard') expect(sim.gatesTotal).toBe(expectedTotals[route]);
    expect(sim.result, `${seed}/${side} at ${sim.trackDistance}. Unpassed beats: ${sim.mainGates.filter(gate => gate.crossedAt === undefined || gate.hit).map(gate => gate.beat)}`)
      .toMatchObject({ title: 'ESCAPED', passed: sim.gatesTotal, accuracy: 1, route });
    expect(chosenAt - guideAt).toBeGreaterThan(1.5);
    expect(sim.pickup?.status === 'collected').toBe(sim.route === 'score');
    expect(sim.beat).toBe(384);
    if (mode === 'standard' && motion === 'cruise' && side === 'center') {
      for (const gate of sim.mainGates) expect(Math.abs(gate.crossedAt! - gate.beat * sim.secondsPerBeat)).toBeLessThan(STEP);
    }
    expect(afterglowAt).toBeGreaterThan(sim.mainGates.at(-1)!.crossedAt!);
    expect(sim.trackDistance + 440).toBeLessThan(sim.path.length);
    if (motion === 'boost' && mode === 'standard') {
      expect(plan.gates.length).toBeGreaterThan(12);
      expect(sim.encore).toMatchObject({ passed: plan.gates.length, missed: 0, neutralized: 0 });
      expect(afterglowAt).toBeGreaterThan(plan.gates.at(-1)!.crossedAt!);
      expect(afterglowAt).toBeLessThan(174);
    } else if (motion === 'cruise' || mode === 'sightseeing') expect(sim.encore).toBeUndefined();
    if (seed === 0 && side === 'center') console.log({ difficulty, mode, motion, gates: sim.gatesTotal,
      encore: sim.encore?.passed, afterglowAt, choiceSeconds: chosenAt - guideAt });
  }
});

test('every aperture has a reachable successor with real keyboard damping, reaction delay and maximum speed', () => {
  for (const difficulty of ['easy', 'normal', 'hard', 'impossible'] as const) for (const seed of [0, 1]) for (const side of routeSides) {
    const sim = new Simulation(orbit, { align: true, branchSide: side });
    sim.start(difficulty, seed);
    while (sim.phase === 'playing') sim.step(STEP, { ...idleInput, boosting: true,
      target: sim.routeGuide && !sim.branch!.side ? [side === 'left' ? -3.2 : side === 'right' ? 3.2 : 0, 0] : null });
    const gates = [...sim.mainGates, ...sim.outroPlan!.gates].filter(g => g.crossedAt !== undefined);
    for (let i = 1; i < gates.length; i++) {
      const previous = gates[i - 1], next = gates[i];
      const available = next.crossedAt! - previous.crossedAt!;
      if (!isOrbitGate(previous.kind) || !isOrbitGate(next.kind)) throw new Error('Non-ORBIT gate');
      const a = orbitPreset(previous.kind, previous.open);
      const b = orbitPreset(next.kind, next.open);
      for (const from of a.holes) {
        const possible = b.holes.some(to => {
          let [x, y] = apertureAnchors[from.anchor], tx = x, ty = y;
          const [gx, gy] = apertureAnchors[to.anchor];
          for (let t = 0; t < available - STEP / 2; t += STEP) {
            if (t >= .15) [tx, ty] = steer({ ...idleInput, axisX: axis(gx - tx), axisY: axis(gy - ty) }, tx, ty, STEP);
            x += (tx - x) * steeringDamping(STEP); y += (ty - y) * steeringDamping(STEP);
          }
          return canPass(next.kind, next.open, next.axis, x, y);
        });
        expect(possible, `${difficulty}/${side}: ${JSON.stringify(previous)} ${from.anchor} → ${JSON.stringify(next)} (${available}s)`).toBe(true);
      }
    }
  }
});

test('ending inspection uses STARWAKE chapters, full branch bounds and aperture Encore for each mode', () => {
  for (const mode of ['standard', 'sightseeing'] as const) for (const route of ['main', 'challenge', 'score'] as const) {
    const inspection = new OutroInspection(mode, 0, route, undefined, 'impossible', orbit);
    for (const preset of ['build', 'drop', 'finale', 'branch-preview', 'branch-entry', 'branch-rejoin', 'main-last',
      'encore-first', 'encore-final', 'afterglow-entry', 'afterglow-peak', 'music-end', 'results-world'] as const) {
      const view = inspection.view(preset, 'Boost');
      const state = inspection.state(view.station, view.musicBeat ?? 370, 'Boost', preset);
      expect(Number.isFinite(view.station)).toBe(true);
      expect(state.trackDistance).toBeCloseTo(view.station, 5);
      expect(state.beat).toBeLessThanOrEqual(384);
      expect(state.previewGates.every(g => g.kind.startsWith('orbit-'))).toBe(true);
    }
    expect(inspection.plan.gates.length === 0).toBe(mode === 'sightseeing');
  }
});
