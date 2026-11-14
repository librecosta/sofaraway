import { expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { clamp, lanePoint } from '../../app/game/core/collision';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { sectionAt, volumeById } from '../../app/game/core/volumes';

const volume = volumeById('daybreak');

test('DAYBREAK uses the new score boundaries and leaves room for the shutter transitions', () => {
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
    for (const [i, gate] of chart.entries()) {
      expect(sectionAt(volume, gate.beat)?.name).toBe(gate.section);
      expect(gate.kind).toBe('shutter');
      if (i) expect(gate.beat - chart[i - 1].beat).toBeGreaterThanOrEqual(2.5);
    }
  }
});

test.each(difficulties)('%s clears the new chart through actual steering at cruise and sustained Boost', difficulty => {
  for (const boosting of [false, true]) {
    const sim = new Simulation(volume);
    sim.start(difficulty);
    let judged = 0;
    let ready = 0;
    for (let frame = 0; sim.phase === 'playing' && frame <= 144 / STEP + 2; frame++) {
      if (sim.gatesJudged !== judged) {
        judged = sim.gatesJudged;
        ready = sim.time + .15;
      }
      const gate = sim.previewGates.find(item => !item.judged);
      const target = gate && sim.time >= ready ? lanePoint(gate.kind, gate.open, gate.axis) : null;
      const axis = (coordinate: 0 | 1, value: number) => target ? clamp((target[coordinate] - value) / (6.2 * STEP), -1, 1) : 0;
      sim.step(STEP, { ...idleInput, axisX: axis(0, sim.camera.tx), axisY: axis(1, sim.camera.ty), boosting });
    }
    expect(sim.result, `Boost=${boosting}`).toMatchObject({ title: 'ESCAPED', accuracy: 1, unreached: 0 });
    expect(sim.hits).toBe(0);
    expect(sim.beat).toBe(288);
  }
});
