import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { idleInput } from '../../app/game/core/input';
import { canPass, lanePoint, playerViewOffset, SECTION } from '../../app/game/core/collision';
import { advanceProp, dressingClearances, isProp, launchProp, makeDressingPlan, PROP_GATE_BUFFER, propKinds,
  propShape, structureKinds, sweepFraction } from '../../app/game/core/dressing';
import { STEP } from '../../app/game/core/clock';
import { corridorLength, Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { buildPath } from '../../app/game/graphics/path';
import { MaterialLibrary } from '../../app/game/graphics/materials/library.client';
import { buildDressingModel } from '../../app/game/graphics/dressing-kit.client';

const volume = volumeById('elsewhere');
const path = buildPath(corridorLength(volume), 150, 46, volume.topology);
const plan = makeDressingPlan(volume, path);

test('world installations cover the kit and keep all branch, curve, gate and pickup zones clear', () => {
  const again = buildPath(corridorLength(volume), 150, 46, volume.topology);
  expect(makeDressingPlan(volume, again)).toEqual(plan);
  expect(new Set(plan.map(p => p.kind))).toEqual(new Set([...structureKinds, ...propKinds]));
  expect(new Set(plan.map(p => p.id)).size).toBe(plan.length);
  const { junctions, pickups, gates } = dressingClearances(volume);
  for (const p of plan) {
    expect(path.segments.some(s => s.type === 'straight' && s.s0 + 9 < p.station && p.station < s.s1 - 9)).toBe(true);
    expect(junctions.every(([lo, hi]) => p.station < lo || p.station > hi)).toBe(true);
    expect(pickups.every(pickup => Math.abs(pickup - p.station) > 21)).toBe(true);
    if (isProp(p)) {
      expect(gates.every(gate => Math.abs(gate - p.station) >= PROP_GATE_BUFFER)).toBe(true);
      const reachable = playerViewOffset(p.x / 0.88, -2.59);
      expect(Math.hypot(reachable[0] - p.x, reachable[1] - p.y)).toBeLessThan(propShape[p.kind].radius);
    }
  }
  for (const id of ['drift', 'descent', 'orbit']) expect(makeDressingPlan(volumeById(id), path)).toEqual([]);
  expect(plan.filter(isProp).find(p => p.kind === 'tech-crate')!.station).toBeLessThan(4600);
  expect(plan.filter(isProp).find(p => p.kind === 'utility-barrel')!.station).toBeLessThan(5100);
});

test('all seven real models have finite triangles and installation envelopes outside the flight lane', () => {
  const library = new MaterialLibrary();
  for (const kind of [...structureKinds, ...propKinds]) {
    const parts = buildDressingModel(kind, library);
    const envelope = plan.find(p => p.kind === kind)!;
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.length).toBeLessThanOrEqual(4);
    for (const { geometry, material } of parts) {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
      expect(material.name).not.toBe('');
      expect(p.count % 3).toBe(0);
      expect(n.count).toBe(p.count);
      for (let i = 0; i < p.count; i++) {
        const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
        const length = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
        if (![x, y, z, length].every(Number.isFinite) || length < .96 || length > 1.04) {
          throw new Error(`${kind} has an invalid vertex or normal at ${i}`);
        }
        if (isProp(envelope)) continue;
        const installedX = envelope.mount === 'ceiling' ? x : Math.abs(envelope.x) - z;
        const installedY = envelope.y + y;
        if (Math.abs(installedX) + Math.abs(installedY) > SECTION.a + SECTION.b - SECTION.ch + .055 ||
          (Math.abs(installedX) < SECTION.a - .60 && Math.abs(installedY) < SECTION.b - .60)) {
          throw new Error(`${kind} left its mount envelope at (${installedX}, ${installedY})`);
        }
      }
      geometry.dispose();
    }
  }
  library.dispose();
});

test('nearest-point sweep detects a skipped endpoint but misses a nearby parallel trajectory', () => {
  const a = new Vector3(-2, 0, 0), b = new Vector3(2, 0, 0);
  const scratch = new Vector3(), relative = new Vector3();
  expect(sweepFraction(a, b, new Vector3(0, .5, 0), .6, scratch, relative)).toBe(.5);
  expect(sweepFraction(a, b, new Vector3(0, .61, 0), .6, scratch, relative)).toBeUndefined();
  expect(sweepFraction(a, a, new Vector3(-2, 0, 0), .6, scratch, relative)).toBe(0);
});

test.each([[false, 'standard', 0], [true, 'standard', 0], [false, 'sightseeing', 1], [true, 'sightseeing', 1]] as const)(
  'active floor steering hits a prop and never changes flight or results (Boost %s, %s)', (boosting, mode, index) => {
  const sim = new Simulation(volume, {}, path), control = new Simulation(volume, {}, path);
  const prop = sim.dressing!.props[index];
  Object.defineProperty(control, 'dressing', { value: undefined });
  sim.start('normal', 0, undefined, mode); control.start('normal', 0, undefined, mode);
  while (sim.trackDistance < prop.station + 2 && sim.phase === 'playing') {
    const gate = sim.previewGates.find(g => !g.judged);
    const aiming = gate && gate.worldStation - sim.trackDistance < 12;
    const aim = aiming ? lanePoint(gate.kind, gate.open, gate.axis) : [0, 0] as [number, number];
    if (aiming) expect(canPass(gate.kind, gate.open, gate.axis, ...aim)).toBe(true);
    const target = sim.trackDistance > prop.station - 11 ? [prop.x / .88, -2.59] as [number, number] : aim;
    const input = { ...idleInput, boosting, target };
    sim.step(STEP, input); control.step(STEP, input);
  }
  const stats = (s: Simulation) => [s.phase, s.camera, s.distance, s.lives, s.score, s.combo, s.gatesPassed, s.gatesJudged, s.pickup, s.branch];
  expect(stats(sim)).toEqual(stats(control));
  expect(sim.phase).toBe('playing');
  expect(sim.dressing!.motion.size).toBe(1);
  const pose = sim.dressing!.motion.get(prop.id)!;
  expect(pose).toBeDefined();
  expect(pose.along).toBeGreaterThan(0);
  expect(pose.pitch).toBeGreaterThan(0);
  sim.dressing!.step(STEP, prop.station - .5, prop.station + .5, prop.x, -2.59, prop.x, -2.59, sim.speed, true);
  expect(sim.dressing!.motion.get(prop.id)).toBe(pose);
  sim.returnToMenu(); sim.start('normal', 123);
  expect(sim.dressing!.motion.size).toBe(0);
  expect(sim.dressing!.plan).toEqual(plan);
  });

test('the default centered path and non-interactive recovery do not hit floor props', () => {
  const sim = new Simulation(volume, { align: true }, path);
  sim.start('easy');
  const prop = sim.dressing!.props[0];
  const x = prop.x / .88;
  sim.dressing!.step(STEP, prop.station - .5, prop.station + .5, x, -2.59, x, -2.59, 40, false);
  sim.dressing!.step(STEP, prop.station - .5, prop.station + .5, 0, 0, 0, 0, 40, true);
  expect(sim.dressing!.motion.size).toBe(0);
  const state = launchProp(prop, .17, .12, 42);
  expect(state.vf).toBeGreaterThan(4);
  expect(state.vx).toBeGreaterThan(0);
  for (let i = 0; i < 480; i++) advanceProp(prop, state, STEP);
  expect(state.settled).toBe(true);
  expect(state.y).toBeGreaterThan(-SECTION.b);
});
