import { expect, test } from 'vitest';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import { buildChart, chartFor, difficultySettings } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { lanePoint } from '../../app/game/core/collision';
import { difficultiesFor } from '../../app/game/core/difficulty';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';

const orbit = volumeById('orbit');
const axis = (delta: number) => Math.abs(delta) < .052 ? 0 : Math.sign(delta);

test('ORBIT shares the ELSEWHERE arrangement and Hard anchors outside the junction buffers', () => {
  const elsewhere = volumeById('elsewhere');
  expect(orbit.sections).toBe(elsewhere.sections);
  expect(orbit).toMatchObject({ bpm: 128, beats: 448, music: 'techno' });
  expect(buildChart(orbit)).toEqual(buildChart(elsewhere));
  expect(difficultiesFor('orbit')).toEqual(['easy', 'normal', 'hard', 'impossible']);
  expect(difficultySettings(orbit, 'impossible')).toMatchObject({ lives: 1, mult: 3.4, speedFactor: 1.15 });
  const hard = chartFor(orbit, 'hard');
  const impossible = chartFor(orbit, 'impossible');
  expect(impossible.filter(gate => !gate.inserted)).toEqual(hard);
  expect(impossible.some(gate => gate.inserted)).toBe(true);
  expect(impossible.some(({ beat }) => (beat >= 310 && beat < 320) || (beat >= 352 && beat < 356))).toBe(false);
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
    expect(exit.beat).toBeGreaterThanOrEqual(356);
    let lastCrossing = -Infinity, extra = 0, afterglowAt = 0, guideAt = 0, chosenAt = 0;
    while (sim.phase === 'playing') {
      const index = sim.gatesJudged;
      const gate = sim.mainGates[index] ?? plan.gates[extra];
      const following = sim.mainGates[index + 1] ?? plan.gates[extra + 1];
      const choosing = !!sim.routeGuide && !sim.branch!.side;
      const pickup = sim.pickup?.status === 'pending' && sim.pickupStation - sim.trackDistance < (mode === 'sightseeing' ? 6 : 17)
        && sim.trackDistance < sim.pickupStation;
      if (choosing && !guideAt) guideAt = sim.time;
      let [x, y] = choosing ? [side === 'left' ? -3.2 : side === 'right' ? 3.2 : 0, 0]
        : pickup ? [0, 1] : gate ? lanePoint(gate.kind, gate.open, gate.axis) : [0, 0];
      if (!choosing && !pickup && gate?.kind === 'iris') { x *= .65; y *= .65; }
      else if (!choosing && !pickup && gate && following?.kind === 'iris' && (sim.branch!.side || ('beat' in following && following.beat < 310))) {
        [x, y] = lanePoint(following.kind, following.open, following.axis).map(value => value * .39);
      }
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
    expect(sim.pickup).toEqual({ kind, status: 'collected' });
    expect(sim.beat).toBe(448);
    expect(afterglowAt).toBeGreaterThan(sim.mainGates.at(-1)!.crossedAt!);
    expect(sim.trackDistance + 440).toBeLessThan(sim.path.length);
    if (motion === 'boost') {
      expect(plan.gates.length).toBeGreaterThan(12);
      expect(sim.encore).toMatchObject({ passed: plan.gates.length, missed: 0, neutralized: 0 });
      expect(afterglowAt).toBeGreaterThan(plan.gates.at(-1)!.crossedAt!);
      expect(afterglowAt).toBeLessThan(204);
    } else if (motion === 'cruise') expect(sim.encore).toBeUndefined();
    if (seed === 0 && side === 'center') console.log({ difficulty, mode, motion, gates: sim.gatesTotal,
      encore: sim.encore?.passed, afterglowAt, choiceSeconds: chosenAt - guideAt });
  }
});
