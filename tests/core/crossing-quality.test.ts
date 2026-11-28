import { expect, test } from 'vitest';
import { ROUTE_GATE_MULTIPLIERS } from '../../app/game/core/branches';
import { difficultySettings } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, clampSection, DIAMOND_EXTENT, HUB_R, lanePoint, SQUARE_HALF } from '../../app/game/core/collision';
import type { Point } from '../../app/game/core/collision';
import { gateCrossingQuality } from '../../app/game/core/crossing-quality';
import { daybreakGateKinds, daybreakGates, daybreakProfile } from '../../app/game/core/daybreak-gates';
import { descentGateKinds, laserBeamRadius, laserClearance, laserOpening } from '../../app/game/core/descent-gates';
import { idleInput, steeringDamping } from '../../app/game/core/input';
import { apertureAnchors, apertureSizes, orbitGateKinds, orbitPresets } from '../../app/game/core/orbit-gates';
import { RESONANCE_BONUS } from '../../app/game/core/pickups';
import { BOOST_GATE_MULTIPLIER, COMBO_SCORE_CAP, COMBO_SCORE_STEP, ENCORE_BASE_POINTS, ENCORE_QUALITY_BONUS,
  MAIN_GATE_POINTS, MAIN_QUALITY_BONUS, TRAVEL_POINTS_PER_UNIT } from '../../app/game/core/scoring';
import { SECTION } from '../../app/game/core/section';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';

const lerp = (start: readonly [number, number], end: readonly [number, number], t: number): Point =>
  [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
const around = [[0, 'precision'], [.2, 'precision'], [.2001, 'normal'], [.9499, 'normal'],
  [.95, 'nearMiss'], [.999, 'nearMiss'], [1, null], [1.001, null]] as const;

test('square and diamond normalize by their own scales and retain strict collision edges', () => {
  for (const [kind, scale] of [['square', SQUARE_HALF], ['diamond', DIAMOND_EXTENT]] as const) {
    for (const [fraction, quality] of around) {
      expect(gateCrossingQuality(kind, 0, 0, fraction * scale, 0)).toBe(quality);
    }
    expect(gateCrossingQuality(kind, 0, 0, NaN, 0)).toBeNull();
    expect(gateCrossingQuality(kind, 0, 0, Infinity, 0)).toBeNull();
    expect(gateCrossingQuality(kind, 1, 0, 0, 0)).toBeNull();
  }
  expect(gateCrossingQuality('square', 0, 0, .19 * SQUARE_HALF, .19 * SQUARE_HALF)).toBe('precision');
  expect(gateCrossingQuality('diamond', 0, 0, .19 * DIAMOND_EXTENT, .19 * DIAMOND_EXTENT)).toBe('normal');
});

test('all Iris sectors use the lane target, solid hub and spokes, excluding the outer wall', () => {
  for (let sector = 0; sector < 8; sector++) {
    const target = lanePoint('iris', sector, 0);
    const radius = Math.hypot(...target);
    const [tx, ty] = target;
    const hub: Point = [tx * HUB_R / radius, ty * HUB_R / radius];
    const classify = (...point: Point) => gateCrossingQuality('iris', sector, 0, ...point);
    expect(classify(...target)).toBe('precision');
    expect(classify(...lerp(target, hub, .2))).toBe('precision');
    expect(classify(...lerp(target, hub, .21))).toBe('normal');
    expect(classify(...lerp(target, hub, .9499))).toBe('normal');
    expect(classify(...lerp(target, hub, .95))).toBe('nearMiss');
    expect(classify(...lerp(target, hub, 1.001))).toBeNull();
    for (const sign of [-1, 1]) for (const [t, quality] of [[.9499, 'normal'], [.95, 'nearMiss'], [1.001, null]] as const) {
      const offset = Math.tan(Math.PI / 8) * t * sign;
      expect(classify(tx - ty * offset, ty + tx * offset)).toBe(quality);
    }
  }
  expect(gateCrossingQuality('iris', 0, 0, HUB_R, 0)).toBe('nearMiss');
  expect(gateCrossingQuality('iris', 0, 0, SECTION.a, 0)).toBe('normal');
  expect(gateCrossingQuality('iris', 0, 0, SECTION.a + .01, 0)).toBeNull();
});

test('DAYBREAK scales each convex gap about its target and excludes cabin edges from near misses', () => {
  for (const kind of daybreakGateKinds) for (const open of daybreakGates[kind].openings.keys()) {
    const { gap, target, rim } = daybreakProfile(kind, open);
    for (const [from, to] of rim) {
      const edge = lerp(from, to, .5);
      for (const [fraction, quality] of around) {
        const p = lerp(target, edge, fraction);
        // A vertex-derived exact edge can fall on either side by one floating-point bit.
        const expected = fraction === 1 && canPass(kind, open, 0, ...p) ? 'nearMiss' : quality;
        expect(gateCrossingQuality(kind, open, 0, ...p), `${kind}/${open}/${fraction}`).toBe(expected);
      }
    }
    for (const [i, from] of gap!.entries()) {
      const to = gap![(i + 1) % gap!.length];
      if (!rim.some(edge => edge[0] === from && edge[1] === to)) {
        const p = lerp(target, lerp(from, to, .5), .999);
        expect(gateCrossingQuality(kind, open, 0, ...p)).toBe('normal');
      }
    }
  }
  expect(gateCrossingQuality('daybreak-crystal', -1, 0, 0, 0)).toBeNull();
});

test('DESCENT rewards only formal openings, with real blocked laser rims and ordinary passable slits', () => {
  for (const kind of descentGateKinds) for (const axis of [0, 1] as const) for (let open = 0; open < 8; open++) {
    const { extent, target, normal } = laserOpening(kind, open, axis);
    const sides = extent[1] === null ? [{ normal, width: extent[0] }]
      : [{ normal, width: extent[0] }, { normal: [0, 1], width: extent[1] }];
    const context = `${kind}/${open}/${axis}`;
    const classify = (...point: Point) => gateCrossingQuality(kind, open, axis, ...point);
    expect(classify(target[0], target[1]), context).toBe('precision');
    for (const { width, normal: direction } of sides) {
      const sign = (target[0] * direction[0] + target[1] * direction[1]) > 0 ? -1 : 1;
      const offset = (distance: number): Point =>
        [target[0] + sign * direction[0] * distance, target[1] + sign * direction[1] * distance];
      for (const [fraction, quality] of around) {
        const p = offset(fraction * width);
        const expected = fraction >= 1 && canPass(kind, open, axis, ...p)
          ? (fraction === 1 ? classify(...offset(width - 1e-8)) : 'normal') : quality;
        expect(classify(...p), `${context}/${fraction}`).toBe(expected);
      }
      expect(laserClearance(kind, open, axis, ...offset(width + laserBeamRadius.outline / 2)), context).toBeLessThan(0);
      const slit = Array.from({ length: 120 }, (_, i) => offset(width + .06 + i * .004))
        .find(p => canPass(kind, open, axis, ...p));
      expect(slit, context).toBeDefined();
      expect(classify(...slit!), context).toBe('normal');
    }
  }
  const y = laserOpening('laser-matrix', 0, 0).target[1];
  expect(gateCrossingQuality('laser-matrix', 0, 0, SECTION.a - .01, y)).toBe('normal');
});

test('ORBIT all presets classify each aperture about its own anchor and shape', () => {
  for (const kind of orbitGateKinds) for (const [open, { holes }] of orbitPresets[kind].entries()) {
    for (const hole of holes) {
      const [x, y] = apertureAnchors[hole.anchor];
      const scale = apertureSizes[hole.shape][hole.size];
      for (const [fraction, quality] of around) {
        const px = x + fraction * scale;
        const expected = fraction === 1 && canPass(kind, open, 0, px, y) ? 'nearMiss' : quality;
        expect(gateCrossingQuality(kind, open, 0, px, y), `${kind}/${open}/${hole.anchor}/${fraction}`).toBe(expected);
      }
      for (const other of holes.filter(item => item !== hole)) {
        const [ox, oy] = apertureAnchors[other.anchor];
        const otherSize = apertureSizes[other.shape][other.size];
        expect(Math.max(Math.abs(x - ox), Math.abs(y - oy)), 'The current preset has disjoint aperture bounds')
          .toBeGreaterThan(scale + otherSize);
      }
    }
  }
});

test('each gate family has steerable, mutually exclusive precision and near-miss samples', () => {
  const kinds = ['iris', 'square', 'diamond', ...daybreakGateKinds, ...descentGateKinds, ...orbitGateKinds] as const;
  for (const kind of kinds) {
    const totals = { normal: 0, precision: 0, nearMiss: 0 };
    for (let i = -86; i <= 86; i++) for (let j = -66; j <= 66; j++) {
      const x = i * .04, y = j * .04;
      const [cx, cy] = clampSection(x, y, .34);
      if (x !== cx || y !== cy) continue;
      const quality = gateCrossingQuality(kind, 0, 0, x, y);
      expect(quality !== null, kind).toBe(canPass(kind, 0, 0, x, y));
      if (quality) totals[quality]++;
    }
    expect(Math.min(totals.precision, totals.nearMiss), kind).toBeGreaterThan(0);
    expect(totals.normal, kind).toBeGreaterThan(Math.max(totals.precision, totals.nearMiss));
  }
});

const volume = volumeById('elsewhere');

test('main awards include route, difficulty and Resonance but no extra Boost or Combo factor', () => {
  for (const [quality, x] of [['precision', 0], ['normal', .5 * SQUARE_HALF], ['nearMiss', .98 * SQUARE_HALF]] as const) {
    const sim = new Simulation(volume);
    sim.start('hard', 0);
    sim.boosting = true;
    sim.combo = COMBO_SCORE_CAP - 1;
    sim.resonance = 2;
    sim.score = .8;
    const gate = { ...sim.mainGates[0], kind: 'square', open: 0, route: 'score' } as const;
    sim['judge'](gate, x, 0, 1, false);
    const routeMult = ROUTE_GATE_MULTIPLIERS.score, { mult } = difficultySettings(volume, 'hard');
    const baseline = .8 + MAIN_GATE_POINTS * BOOST_GATE_MULTIPLIER * (1 + COMBO_SCORE_CAP * COMBO_SCORE_STEP) *
      mult * routeMult * (1 + RESONANCE_BONUS);
    const bonus = MAIN_QUALITY_BONUS[quality] * mult * routeMult * (1 + RESONANCE_BONUS);
    expect(sim.score).toBeCloseTo(baseline + bonus, 10);
    expect(sim.combo).toBe(COMBO_SCORE_CAP);
    expect(sim.resonance).toBe(1);
    expect([sim.gatesPassed, sim.precisionPasses, sim.nearMissPasses]).toEqual([1, Number(quality === 'precision'), Number(quality === 'nearMiss')]);
    expect(sim.message).toEqual(quality === 'normal' ? null
      : { id: quality === 'precision' ? 'precisionBonus' : 'nearMissBonus', points: Math.floor(baseline + bonus) - Math.floor(baseline) });
  }
});

test('the swept gate uses the crossing coordinates instead of the tick-end camera position', () => {
  const sim = new Simulation(volume);
  sim.start('normal', 0);
  const index = sim.mainGates.findIndex(gate => gate.kind === 'square');
  const gate = sim.mainGates[index];
  sim['judged'] = index;
  const damping = steeringDamping(STEP);
  const target: Point = [0, 2.5];
  const travel = sim.speed * STEP;
  sim.distance = gate.routeStation - travel * .5;
  sim.camera.y = -target[1] * damping / (2 - damping);
  sim.score = 10;
  const start = sim.distance;
  sim.step(STEP, { ...idleInput, target });
  const { mult } = difficultySettings(volume, 'normal');
  expect(gateCrossingQuality('square', 0, 0, sim.camera.x, sim.camera.y)).toBe('normal');
  expect([sim.gatesPassed, sim.precisionPasses]).toEqual([1, 1]);
  expect(sim.score).toBeCloseTo(10 + (sim.distance - start) * TRAVEL_POINTS_PER_UNIT +
    mult * (MAIN_GATE_POINTS * (1 + COMBO_SCORE_STEP) + MAIN_QUALITY_BONUS.precision), 8);
});

test('failed, shielded, invulnerable and neutralized crossings cannot earn a quality reward', () => {
  for (const attempt of ['hit', 'shield', 'invulnerable', 'god', 'recovery'] as const) {
    const sim = new Simulation(volume, { god: attempt === 'god' });
    sim.start('normal', 0);
    sim.shield = attempt === 'shield';
    if (attempt === 'invulnerable') sim['invulnUntil'] = 2;
    const gate = { ...sim.mainGates[0], kind: 'square', open: 0 } as const;
    sim['judge'](gate, attempt === 'recovery' ? 0 : SQUARE_HALF, 0, 1, attempt === 'recovery');
    expect([sim.precisionPasses, sim.nearMissPasses, sim.message, sim.shield]).toEqual([0, 0, null, false]);
    expect([sim.gatesPassed, sim.gatesNeutralized, sim.hits]).toEqual([
      Number(attempt === 'god'), Number(attempt === 'recovery'), Number(attempt === 'hit'),
    ]);
    const { mult } = difficultySettings(volume, 'normal');
    expect(sim.score).toBe(attempt === 'god' ? MAIN_GATE_POINTS * mult * (1 + COMBO_SCORE_STEP) : 0);
  }
});

test('Encore combines the same qualities, preserves the main score, and counts only live passes', () => {
  const sim = new Simulation(volume, { god: true });
  sim.start('impossible', 0);
  sim.boosting = true;
  sim.resonance = 3;
  const makeGate = () => ({ ...sim.outroPlan!.gates[0], kind: 'square' as const, open: 0 });
  for (const [x, id, points] of [[0, 'precisionBonus', ENCORE_QUALITY_BONUS.precision],
    [.98 * SQUARE_HALF, 'nearMissBonus', ENCORE_QUALITY_BONUS.nearMiss],
    [.5 * SQUARE_HALF, 'encorePassed', ENCORE_BASE_POINTS], [SQUARE_HALF, 'encorePassed', ENCORE_BASE_POINTS]] as const) {
    sim['judgeEncore'](makeGate(), x, 0, 1, false);
    expect(sim.message).toEqual({ id, points });
  }
  sim['judgeEncore'](makeGate(), 0, 0, 2, true);
  expect(sim.encore).toMatchObject({ encountered: 5, passed: 4, precision: 1, nearMiss: 1, missed: 0, neutralized: 1,
    bonusScore: 4 * ENCORE_BASE_POINTS + ENCORE_QUALITY_BONUS.precision + ENCORE_QUALITY_BONUS.nearMiss });
  expect([sim.score, sim.resonance]).toEqual([0, 3]);
});
