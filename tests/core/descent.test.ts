import { expect, test } from 'vitest';
import type { BufferGeometry } from 'three';
import { difficulties } from '../../app/game/contracts';
import { chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, clampSection, lanePoint } from '../../app/game/core/collision';
import { facilityZones } from '../../app/game/core/descent-facility';
import { descentGateKinds, matrixCell } from '../../app/game/core/descent-gates';
import { controlEvents, controlTrack, step } from '../../app/game/core/descent-score';
import { idleInput } from '../../app/game/core/input';
import { referenceFor } from '../../app/game/core/reference-track';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { DescentFacility } from '../../app/game/graphics/descent-facility.client';
import { laserEmitters } from '../../app/game/graphics/laser-gates.client';
import { buildRunPath, Path } from '../../app/game/graphics/path';

const volume = volumeById('descent');

test('the closed facility bays and emitter frames mirror across both local axes', () => {
  const path = new Path(120, 10, 'facility');
  path.straight(120);
  const vertices = (geometry: BufferGeometry, mirrorX = 1, mirrorY = 1) => {
    const { position, color } = geometry.attributes;
    return Array.from({ length: position.count }, (_, i) => [
      mirrorX * position.getX(i), mirrorY * position.getY(i), position.getZ(i),
      color.getX(i), color.getY(i), color.getZ(i),
    ].map(value => Math.round(value * 1e5)).join(',')).sort();
  };
  const mirrored = (geometry: BufferGeometry, label: string) => {
    const reference = vertices(geometry);
    expect(vertices(geometry, -1, 1), label + ' horizontal mirror').toEqual(reference);
    expect(vertices(geometry, 1, -1), label + ' vertical mirror').toEqual(reference);
    geometry.dispose();
  };
  for (const zone of facilityZones(volume, 'standard')) {
    const room = new DescentFacility(path, [{ ...zone, start: 0, finish: 120, end: 120 }]);
    // This window includes the framing before the BREACH roof opens.
    for (const mesh of room.build(0, 52)) mirrored(mesh.geometry, zone.section + ' ' + mesh.name);
    room.dispose();
  }
  mirrored(laserEmitters(), 'laser emitters');
});

test('CONTROL accents anchor 174 gates with clear chapter and movement roles', () => {
  const chart = chartFor(volume, 'normal');
  const perSection = (name: string) => chart.filter(gate => gate.section === name);
  const accents = new Set(controlEvents.filter(event => event.voice === 'kick' || event.voice === 'snare' || event.voice === 'ghost')
    .map(event => Math.round(event.at / step) / 4));
  expect(volume.sections.map(({ name }) => perSection(name).length)).toEqual([8, 28, 42, 40, 5, 40, 11]);
  expect(chart.every((gate, i) => accents.has(gate.beat) && (i === 0 || gate.beat - chart[i - 1].beat >= 1.25))).toBe(true);
  expect(chart.at(0)!.beat).toBe(6);
  expect(chart.at(-1)!.beat).toBe(372);
  expect(new Set(chart.filter(gate => gate.kind === 'laser-matrix').map(gate => gate.sector)).size).toBe(8);
  for (const section of ['ORDER', 'LOCK', 'LOCKDOWN']) {
    expect(perSection(section).filter(gate => gate.kind === 'laser-matrix').length).toBeGreaterThan(perSection(section).length * .45);
  }
  expect(perSection('FLIGHT').filter(gate => gate.kind === 'laser-slice').length).toBeGreaterThan(25);
  expect(perSection('PRESSURE').filter(gate => gate.kind === 'laser-weave').length).toBeGreaterThan(12);
  for (const kind of ['laser-slice', 'laser-weave']) {
    expect(new Set(chart.filter(gate => gate.kind === kind).map(gate => gate.axis))).toEqual(new Set([0, 1]));
  }
});

test('Matrix gives each outer cell exclusively to one opening while the hub remains blocked', () => {
  for (let open = 0; open < 8; open++) {
    expect(canPass('laser-matrix', open, 0, 0, 0)).toBe(false);
    for (let position = 0; position < 8; position++) {
      const target = lanePoint('laser-matrix', position, 0);
      expect(clampSection(...target, .34)).toEqual(target);
      expect(canPass('laser-matrix', open, 0, ...target)).toBe(open === position);
    }
  }
  expect(canPass('laser-matrix', 0, 0, matrixCell[0] / 2 - .002, 0)).toBe(false);
  expect(canPass('laser-matrix', 0, 0, matrixCell[0] / 2 + .002, 0)).toBe(true);
});

test('Slice has two independent axes and Weave mirrors the safe slope', () => {
  expect(canPass('laser-slice', 2, 0, 0, -2.5)).toBe(true);
  expect(canPass('laser-slice', 2, 0, 2, 1.7)).toBe(false);
  expect(canPass('laser-slice', 2, 1, 2, 1.7)).toBe(true);
  expect(canPass('laser-slice', 2, 1, 0, -2.5)).toBe(false);
  expect(canPass('laser-weave', 1, 0, 2.25, 1.64)).toBe(true);
  expect(canPass('laser-weave', 1, 0, 2.25, -1.64)).toBe(false);
  expect(canPass('laser-weave', 3, 1, 2.25, -1.64)).toBe(true);
  expect(canPass('laser-weave', 3, 1, 2.25, 1.64)).toBe(false);
});

test.each(['standard', 'sightseeing'] as const)('the %s path meets the CONTROL sector stations, including the vertical drop', mode => {
  const reference = referenceFor(volume);
  const path = buildRunPath(volume, mode);
  const zones = facilityZones(volume, mode);
  expect(zones.map(zone => zone.section)).toEqual(controlTrack.sections.map(({ name }) => name));
  expect(zones.map(zone => zone.name)).toEqual(['CONTROL', 'CONTROL', 'TRANSIT', 'THE WELL', 'CORE', 'LOCKDOWN', 'BREACH']);
  expect(path.sample(reference.station(210, mode)).f.y).toBeCloseTo(-1, 8);
  expect(path.sample(reference.station(274, mode)).f.y).toBeCloseTo(0, 8);
  for (const boundary of path.boundaries(0, path.length)) {
    const before = path.sample(boundary - .001), after = path.sample(boundary + .001);
    expect(before.p.distanceTo(after.p)).toBeCloseTo(.002, 6);
    expect(before.f.dot(after.f)).toBeGreaterThan(.99999);
  }
  expect(path.length - reference.boostFinish(mode)).toBeGreaterThan(440);
});

test.each([...difficulties, 'sightseeing'] as const)('%s completes with real 60 Hz steering at cruise and Boost', mode => {
  const difficulty = mode === 'sightseeing' ? 'normal' : mode;
  const chart = chartFor(volume, difficulty);
  expect(new Set(chart.map(gate => gate.kind))).toEqual(new Set(descentGateKinds));
  expect(chart.at(-1)!.beat).toBeLessThanOrEqual(372);
  for (const boost of ['cruise', 'continuous', 'intervals']) {
    const sim = new Simulation(volume, undefined, undefined, mode === 'sightseeing' ? mode : 'standard');
    sim.start(difficulty, 0, undefined, mode === 'sightseeing' ? mode : 'standard');
    let lastCrossing = -Infinity;
    const axis = (delta: number) => Math.abs(delta) < .08 ? 0 : Math.sign(delta);
    while (sim.phase === 'playing') {
      const previous = sim.gatesJudged;
      const gate = sim.mainGates[previous];
      const steer = gate && sim.time >= lastCrossing + .15 - 1e-9;
      const [x, y] = steer ? lanePoint(gate.kind, gate.open, gate.axis) : [sim.camera.tx, sim.camera.ty];
      const boosting = boost === 'continuous' || (boost === 'intervals' && sim.time % 6 < 2.5);
      sim.step(STEP, { ...idleInput, boosting, axisX: axis(x - sim.camera.tx), axisY: axis(y - sim.camera.ty) });
      if (previous === sim.gatesJudged) continue;
      lastCrossing = gate.crossedAt!;
      expect(sim.gatesPassed, `${mode} ${boost} missed ${gate.kind} at ${gate.beat}`).toBe(previous + 1);
    }
    expect(sim.result).toMatchObject({ title: 'ESCAPED', unreached: 0, accuracy: 1 });
  }
});
