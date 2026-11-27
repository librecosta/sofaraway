import { expect, test } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { REJOIN_BEAT, routeCharts, SPLIT_BEAT } from '../../app/game/core/branches';
import { chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, DIAMOND_EXTENT, HUB_R, lanePoint, opening, SQUARE_HALF } from '../../app/game/core/collision';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';

const elsewhere = volumeById('elsewhere');
const sequences: Record<string, string> = {
  A: 'I', B: 'IIIS', BUILD: 'IIID', DROP: 'IISID', BREAK: 'ISIDIS', A2: 'IISID', FINALE: 'ISIDI',
};

test('the three openings use fixed dimensions and the centre belongs only to Square and Diamond', () => {
  expect([HUB_R, SQUARE_HALF, DIAMOND_EXTENT]).toEqual([1.02, 1.35, 1.91]);
  for (let sector = 0; sector < 8; sector++) {
    expect(canPass('iris', sector, 0, 0, 0)).toBe(false);
    expect(canPass('iris', sector, 0, ...lanePoint('iris', sector, 0))).toBe(true);
    for (const kind of ['square', 'diamond'] as const) {
      expect(opening(kind, sector)).toBe(0);
      expect(lanePoint(kind, sector, 1)).toEqual([0, 0]);
      expect(canPass(kind, sector, 1, 0, 0)).toBe(true);
    }
  }
  expect(canPass('iris', 0, 0, 1.02, 0)).toBe(true);
  expect(canPass('iris', 0, 0, 1.019, 0)).toBe(false);
});

test('Square has strict fixed edges and Diamond has strict fixed sides and vertices', () => {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const square = (x: number, y: number) => canPass('square', 0, 0, sx * x, sy * y);
      const diamond = (x: number, y: number) => canPass('diamond', 0, 0, sx * x, sy * y);
      expect(square(1.349, 1.349)).toBe(true);
      expect(square(1.35, 1.349)).toBe(false);
      expect(square(1.349, 1.35)).toBe(false);
      expect(square(1.351, 0.6)).toBe(false);
      expect(diamond(1.909, 0)).toBe(true);
      expect(diamond(0, 1.909)).toBe(true);
      expect(diamond(1.91, 0)).toBe(false);
      expect(diamond(0, 1.91)).toBe(false);
      expect(diamond(0.954, 0.955)).toBe(true);
      expect(diamond(0.955, 0.955)).toBe(false);
      expect(diamond(0.956, 0.955)).toBe(false);
    }
  }
  expect(canPass('square', 0, 0, 1.34, 1.34)).toBe(true);
  expect(canPass('diamond', 0, 0, 1.34, 1.34)).toBe(false);
  expect(canPass('diamond', 0, 0, 1.8, 0)).toBe(true);
  expect(canPass('square', 0, 0, 1.8, 0)).toBe(false);
});

test('ELSEWHERE cycles the authored sections and keeps types at the same beats across difficulties', () => {
  expect([elsewhere.bpm, elsewhere.beats]).toEqual([128, 448]);
  const normal = chartFor(elsewhere, 'normal');
  const kinds = new Map(normal.map(gate => [gate.beat, gate.kind]));
  expect(normal.every(gate => gate.beat >= 16 && gate.beat < 448)).toBe(true);
  for (const [section, sequence] of Object.entries(sequences)) {
    const gates = normal.filter(gate => gate.section === section);
    expect(gates.length, section).toBeGreaterThan(0);
    expect(gates.map(gate => gate.kind[0].toUpperCase()).join(''), section)
      .toBe(sequence.repeat(Math.ceil(gates.length / sequence.length)).slice(0, gates.length));
  }
  for (const difficulty of difficulties) {
    const chart = chartFor(elsewhere, difficulty);
    expect(chart.every(gate => kinds.get(gate.beat) === gate.kind)).toBe(true);
    expect(chart.filter(gate => gate.kind === 'iris')).toHaveLength(difficulty === 'easy' ? 99 : 100);
    expect(chart.filter(gate => gate.kind === 'square')).toHaveLength(24);
    expect(chart.filter(gate => gate.kind === 'diamond')).toHaveLength(20);
  }
  expect([kinds.get(383), kinds.get(384)]).toEqual(['iris', 'iris']);
  expect(chartFor(elsewhere, 'easy').some(gate => gate.beat === 384)).toBe(false);
});

test.each(difficulties)('%s clears ELSEWHERE using keyboard input after a 150 ms reaction delay', difficulty => {
  const sim = new Simulation(elsewhere);
  const original = chartFor(elsewhere, difficulty);
  const chart = [...original.filter(gate => gate.beat < SPLIT_BEAT),
    ...routeCharts(original.filter(gate => gate.beat >= SPLIT_BEAT && gate.beat < REJOIN_BEAT)).main,
    ...original.filter(gate => gate.beat >= REJOIN_BEAT)];
  const transitions = new Set<string>();
  const irisSectors = new Set<number>();
  let sectionChange = false;
  const reaction = 0.150;
  const axis = (delta: number) => Math.abs(delta) < 0.05 ? 0 : Math.sign(delta);
  sim.start(difficulty);
  let lastCrossing = -Infinity;

  const songSteps = Math.ceil(elsewhere.beats * sim.secondsPerBeat / STEP) + 1;
  for (let tick = 0; tick < songSteps && sim.phase === 'playing'; tick++) {
    const index = sim.gatesJudged;
    const gate = chart[index];
    const previous = chart[index - 1];
    let input = idleInput;
    if (gate && sim.time - lastCrossing + 1e-9 >= reaction) {
      const [x, y] = !sim.branch?.side && gate.beat >= SPLIT_BEAT ? [0, 0] : lanePoint(gate.kind, gate.sector, 0);
      input = { ...idleInput, axisX: axis(x - sim.camera.tx), axisY: axis(y - sim.camera.ty) };
    }
    sim.step(STEP, input);
    if (sim.gatesJudged === index) continue;
    lastCrossing = sim.previewGates.find(candidate => candidate.beat === gate.beat)!.crossedAt!;
    expect(sim.gatesPassed, `${previous?.beat ?? 'start'} ${previous?.kind ?? ''} → ${gate.beat} ${gate.kind}`)
      .toBe(index + 1);
    if (gate.kind === 'iris') irisSectors.add(gate.sector);
    if (previous) {
      transitions.add(`${previous.kind} → ${gate.kind}`);
      sectionChange ||= previous.section !== gate.section;
    }
  }

  for (const transition of [
    'iris → square', 'square → iris', 'iris → diamond', 'diamond → iris', 'iris → iris',
  ]) {
    expect(transitions.has(transition)).toBe(true);
  }
  expect(irisSectors.size).toBe(8);
  expect(sectionChange).toBe(true);
  expect([sim.gatesPassed, sim.gatesJudged, sim.hits, sim.lives])
    .toEqual([chart.length, chart.length, 0, elsewhere.lives[difficulty]]);
  for (let n = 0; n < Math.ceil(0.8 / STEP); n++) sim.step(STEP, idleInput);
  expect(sim.phase).toBe('results');
  expect(sim.result).toMatchObject({ title: 'ESCAPED', rank: 'S', accuracy: 1, route: 'main', unreached: 0 });
});
