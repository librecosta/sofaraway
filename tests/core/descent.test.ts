import { expect, test } from 'vitest';
import { Color, Raycaster } from 'three';
import type { BufferGeometry } from 'three';
import { difficulties } from '../../app/game/contracts';
import { chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, clampSection, lanePoint } from '../../app/game/core/collision';
import { facilityZones } from '../../app/game/core/descent-facility';
import { descentGateKinds, laserBandPitch, laserBeamRadius, laserOpening, matrixCell, matrixSubdivisions, weaveCrossPitch } from '../../app/game/core/descent-gates';
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

test('outer room dimensions vary while the laser lanes stay clear of architecture', () => {
  const path = new Path(120, 10, 'facility');
  path.straight(120);
  const frame = path.sample(5);
  const [widths, heights]: [number[], number[]] = [[], []];
  for (const zone of facilityZones(volume, 'standard')) {
    const room = new DescentFacility(path, [{ ...zone, start: 0, finish: 120, end: 120 }]);
    const [structure, work, security] = room.build(0, 80);
    structure.geometry.computeBoundingBox();
    const bounds = structure.geometry.boundingBox!;
    widths.push(bounds.max.x - bounds.min.x);
    heights.push(bounds.max.y - bounds.min.y);
    const lanes = [[0, 0], ...Array.from({ length: 8 }, (_, sector) => lanePoint('laser-matrix', sector, 0))];
    for (const [x, y] of lanes) {
      const origin = frame.p.clone().addScaledVector(frame.r, x).addScaledVector(frame.u, y);
      expect(new Raycaster(origin, frame.f, 0, 71).intersectObjects([structure, work, security]), zone.name).toHaveLength(0);
    }
    const steady = work.material.color.clone();
    room.light(20, 0, new Color(), new Color());
    const idle = security.material.color.clone();
    room.light(20, 1, new Color(), new Color());
    expect(work.material.color).toEqual(steady);
    expect(security.material.color.r).toBeGreaterThan(idle.r);
    for (const mesh of [structure, work, security]) mesh.geometry.dispose();
    room.dispose();
  }
  expect(heights[3]).toBeGreaterThan(heights[2] * 2);
  expect(widths[4]).toBeGreaterThan(widths[3] * 1.20);
  expect(heights[4]).toBeLessThan(heights[3]);
  expect(widths[5]).toBeLessThan(widths[4] / 3);
  expect(widths[6]).toBeGreaterThan(widths[5] * 2);
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

test('Matrix clears exactly one macro cell and fills other cells with three-by-three beam lattices', () => {
  const [w, h] = matrixCell;
  for (let open = 0; open < 8; open++) {
    for (let position = 0; position < 8; position++) {
      const [x, y] = lanePoint('laser-matrix', position, 0);
      expect(clampSection(x, y, .34)).toEqual([x, y]);
      expect(canPass('laser-matrix', open, 0, x, y)).toBe(true);
      expect(canPass('laser-matrix', open, 0, x + w / 6, y)).toBe(open === position);
      expect(canPass('laser-matrix', open, 0, x, y - h / 6)).toBe(open === position);
    }
    expect(canPass('laser-matrix', open, 0, w / 6, 0)).toBe(false);
    expect(canPass('laser-matrix', open, 0, 0, h / 6)).toBe(false);
  }
  for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
    expect(canPass('laser-matrix', 0, 0, i * w / matrixSubdivisions, j * h / matrixSubdivisions)).toBe(true);
  }
  expect(canPass('laser-matrix', 0, 0, w / 6 + laserBeamRadius.matrix - .002, 0)).toBe(false);
  expect(canPass('laser-matrix', 0, 0, w / 6 + laserBeamRadius.matrix + .002, 0)).toBe(true);
  expect(canPass('laser-matrix', 0, 0, w / 2 - .002, 0)).toBe(false);
  expect(canPass('laser-matrix', 0, 0, w / 2 + .002, 0)).toBe(true);
});

test('both Slice axes and Weave slopes judge beam bodies and allow their clear gaps', () => {
  for (const kind of ['laser-slice', 'laser-weave'] as const) for (const axis of [0, 1] as const) {
    const { target: [x, y], normal: [nx, ny], extent: [extent] } = laserOpening(kind, 2, axis);
    const point = (across: number, along = 0) => canPass(kind, 2, axis,
      x + nx * across - ny * along, y + ny * across + nx * along);
    expect(point(extent - .004)).toBe(true);
    expect(point(extent + .004)).toBe(false);
    expect(point(extent + laserBandPitch / 2)).toBe(false);
    expect(point(extent + laserBandPitch)).toBe(true);
    if (kind === 'laser-weave') expect(point(extent + laserBandPitch, weaveCrossPitch / 2)).toBe(false);
  }
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
