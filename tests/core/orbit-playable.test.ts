import { expect, test } from 'vitest';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import { buildChart, chartFor, difficultySettings } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, lanePoint } from '../../app/game/core/collision';
import { orbitCueBeats } from '../../app/game/core/orbit-chart';
import { apertureAnchors, isOrbitGate, orbitPreset } from '../../app/game/core/orbit-gates';
import { difficultiesFor } from '../../app/game/core/difficulty';
import { idleInput, steer, steeringDamping } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { OutroInspection } from '../../app/game/debug/outro-inspection';

const orbit = volumeById('orbit');
const axis = (delta: number) => Math.abs(delta) < .052 ? 0 : Math.sign(delta);

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
  ['easy', 'standard', 'cruise'], ['normal', 'standard', 'cruise'], ['hard', 'standard', 'boost'],
  ['impossible', 'standard', 'cruise'], ['impossible', 'standard', 'boost'], ['impossible', 'standard', 'mixed'],
  ['normal', 'sightseeing', 'cruise'],
] as const)('%s %s %s clears each route with keyboard steering and 150 ms reaction', (difficulty, mode, motion) => {
  expect(branchLayout(0)).not.toEqual(branchLayout(1));
  for (const seed of [0, 1]) for (const side of routeSides) {
    const sim = new Simulation(orbit);
    const kind = side === 'center' ? 'lumen' : side === 'left' ? 'resonance' : 'shield';
    sim.start(difficulty, seed, kind, mode);
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
      if (!sim.lives) throw new Error(`${difficulty}/${mode}/${motion}/${seed}/${side} failed at ${gate?.worldStation}`);
    }
    expect(sim.result, `${seed}/${side} at ${sim.trackDistance}. Unpassed beats: ${sim.mainGates.filter(gate => gate.crossedAt === undefined || gate.hit).map(gate => gate.beat)}`)
      .toMatchObject({ title: 'ESCAPED', passed: sim.gatesTotal, accuracy: 1, route: branchLayout(seed)[side] });
    expect(chosenAt - guideAt).toBeGreaterThan(1.5);
    expect(sim.pickup?.status === 'collected').toBe(sim.route === 'score');
    expect(sim.beat).toBe(384);
    if (mode === 'standard' && motion === 'cruise' && side === 'center' && difficulty !== 'easy') {
      for (const gate of sim.mainGates) expect(Math.abs(gate.crossedAt! - gate.beat * sim.secondsPerBeat)).toBeLessThan(STEP);
    }
    expect(afterglowAt).toBeGreaterThan(sim.mainGates.at(-1)!.crossedAt!);
    expect(sim.trackDistance + 440).toBeLessThan(sim.path.length);
    if (motion === 'boost') {
      expect(plan.gates.length).toBeGreaterThan(12);
      expect(sim.encore).toMatchObject({ passed: plan.gates.length, missed: 0, neutralized: 0 });
      expect(afterglowAt).toBeGreaterThan(plan.gates.at(-1)!.crossedAt!);
      expect(afterglowAt).toBeLessThan(174);
    } else if (motion === 'cruise') expect(sim.encore).toBeUndefined();
    if (seed === 0 && side === 'center') console.log({ difficulty, mode, motion, gates: sim.gatesTotal,
      encore: sim.encore?.passed, afterglowAt, choiceSeconds: chosenAt - guideAt });
  }
});

test('every aperture has a reachable successor with real keyboard damping, reaction delay and maximum speed', () => {
  for (const difficulty of ['hard', 'impossible'] as const) for (const seed of [0, 1]) for (const side of routeSides) {
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
