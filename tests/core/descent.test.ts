import { expect, test } from 'vitest';
import { Color, InstancedMesh, Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide } from 'three';
import type { BufferGeometry } from 'three';
import { difficulties } from '../../app/game/contracts';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import { chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { canPass, clampSection, lanePoint } from '../../app/game/core/collision';
import { facilityZones } from '../../app/game/core/descent-facility';
import { descentCargo, descentJunction } from '../../app/game/core/descent-routes';
import { descentGateKinds, laserBandPitch, laserBeamRadius, laserOpening, matrixCell, matrixSubdivisions, weaveCrossPitch } from '../../app/game/core/descent-gates';
import { controlEvents, controlTrack, step } from '../../app/game/core/descent-score';
import { idleInput } from '../../app/game/core/input';
import { referenceFor } from '../../app/game/core/reference-track';
import { ControlLamp, controlLightingAt, controlLightPhrases, controlSetpieceAt, FacilityLightShape, neutralLampGains, newControlLighting }
  from '../../app/game/core/descent-lighting';
import { steadyLights } from '../../app/game/core/rhythmic-lights';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { DescentFacility } from '../../app/game/graphics/descent-facility.client';
import { IndustrialSurface, IndustrialTrim } from '../../app/game/graphics/industrial-geometry';
import { DESCENT_GLASS_THICKNESS, descentGlassPanes } from '../../app/game/graphics/descent-glass';
import { GateGeometries } from '../../app/game/graphics/gates.client';
import { descentExamples } from '../../app/game/debug/catalog';
import { buildRunPath, Path } from '../../app/game/graphics/path';

const volume = volumeById('descent');

test('the closed facility bays mirror across both local axes', () => {
  const path = new Path(120, 10, 'facility');
  path.straight(120);
  const vertices = (geometry: BufferGeometry, mirrorX = 1, mirrorY = 1, includeTint = true) => {
    const { position, color } = geometry.attributes;
    return Array.from({ length: position.count }, (_, i) => [
      mirrorX * position.getX(i), mirrorY * position.getY(i), position.getZ(i),
      ...(includeTint ? [color.getX(i), color.getY(i), color.getZ(i)] : []),
    ].map(value => Math.round(value * 1e5)).join(',')).sort();
  };
  const mirrored = (geometry: BufferGeometry, label: string, separateLensBanks: boolean) => {
    const reference = vertices(geometry);
    expect(vertices(geometry, -1, 1), label + ' horizontal mirror').toEqual(reference);
    expect(vertices(geometry, 1, -1, !separateLensBanks), label + ' vertical mirror')
      .toEqual(separateLensBanks ? vertices(geometry, 1, 1, false) : reference);
    geometry.dispose();
  };
  for (const zone of facilityZones(volume, 'standard')) {
    const room = new DescentFacility(path, [{ ...zone, start: 0, finish: 120, end: 120 }]);
    // This window includes the framing before the BREACH roof opens.
    for (const mesh of room.build(0, 52)) {
      // The staggered optical layouts are independent from the symmetric structural hardware.
      if (mesh instanceof InstancedMesh) {
        expect(mesh.count).toBeGreaterThan(0);
        expect(mesh.geometry.getAttribute('lightSpan').count).toBe(mesh.count);
        mesh.dispose();
        mesh.geometry.dispose();
      } else mirrored(mesh.geometry, zone.section + ' ' + mesh.name, mesh.name === 'facility-fixtures');
    }
    room.dispose();
  }
});

test('all DESCENT glass variants have a beveled thickness and clear their authored opening', () => {
  const templates = new GateGeometries();
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const direction = new Vector3(0, 0, -1);
  const ray = new Raycaster();
  try {
    for (const kind of descentGateKinds) for (const { open, axis } of descentExamples[kind]) {
      expect(descentGlassPanes(kind, open, axis)).toHaveLength(kind === 'laser-matrix' ? 8 : 2);
      const geometry = templates.get(kind, open, axis);
      const plate = new Mesh(geometry, material);
      const [x, y] = lanePoint(kind, open, axis);
      ray.set(new Vector3(x, y, 2), direction);
      expect(ray.intersectObject(plate)).toHaveLength(0);
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.min.z).toBe(0);
      expect(geometry.boundingBox!.max.z).toBeCloseTo(DESCENT_GLASS_THICKNESS, 7);
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    }
    expect(templates.get('laser-slice', 0, 0)).toBe(templates.get('laser-slice', 1, 0));
    expect(templates.get('laser-slice', 0, 0)).not.toBe(templates.get('laser-slice', 0, 1));
  } finally {
    material.dispose();
    templates.dispose();
  }
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
    const roles = (geometry: BufferGeometry) => {
      const tags = geometry.getAttribute('industrialLight');
      return new Set(Array.from({ length: tags.count }, (_, i) => tags.getY(i)));
    };
    const workRoles = [ControlLamp.Roof, ControlLamp.Floor];
    if (zone.name === 'CORE') workRoles.push(ControlLamp.Stator);
    if (zone.name === 'THE WELL') workRoles.push(ControlLamp.Deck, ControlLamp.DeepDeck);
    expect(roles(work.geometry)).toEqual(new Set(workRoles));
    const securityRoles = [ControlLamp.Rail, ControlLamp.Left, ControlLamp.Right];
    if (zone.name === 'LOCKDOWN') securityRoles.push(ControlLamp.Alarm);
    if (zone.name === 'THE WELL') securityRoles.push(ControlLamp.Deck);
    expect(roles(security.geometry)).toEqual(new Set(securityRoles));
    for (const mesh of [structure, work, security]) mesh.geometry.dispose();
    room.dispose();
  }
  expect(heights[3]).toBeGreaterThan(heights[2] * 2);
  expect(widths[4]).toBeGreaterThan(widths[3] * 1.20);
  expect(heights[4]).toBeLessThan(heights[3]);
  expect(widths[5]).toBeLessThan(widths[4] / 3);
  expect(widths[6]).toBeGreaterThan(widths[5] * 2);
});

test('facility finishes and static fixture spill share the structural batch across chunk boundaries', () => {
  const path = new Path(240, 10, 'facility');
  path.straight(240);
  const zone = facilityZones(volume, 'standard')[0];
  const facility = new DescentFacility(path, [{ ...zone, start: 0, finish: 240, end: 240 }]);
  const left = facility.build(0, 210), right = facility.build(210, 240);
  const data = left[0].geometry.getAttribute('industrialSurface');
  const positions = left[0].geometry.getAttribute('position');
  const finishes = new Set<number>();
  let unlit = 0, lit = 0, securityRail = 0;
  for (let i = 0; i < data.count; i++) {
    const code = data.getZ(i);
    const finish = Math.floor(code);
    finishes.add(finish);
    if (code - finish === IndustrialTrim.SecurityRail) {
      securityRail++;
      expect(finish).toBe(IndustrialSurface.Machined);
      const x = Math.abs(positions.getX(i));
      const y = Math.abs(positions.getY(i));
      expect(x).toBeGreaterThan(3.80);
      expect(x).toBeLessThan(4.06);
      expect(y).toBeGreaterThan(.99);
      expect(y).toBeLessThan(1.26);
    }
    const spill = data.getW(i);
    expect(spill).toBeGreaterThanOrEqual(0);
    expect(spill).toBeLessThanOrEqual(1);
    if (spill < .08) unlit++;
    if (spill > .55) lit++;
  }
  expect(finishes).toEqual(new Set([
    IndustrialSurface.Cast, IndustrialSurface.Coated, IndustrialSurface.Machined, IndustrialSurface.Polymer,
  ]));
  expect(unlit).toBeGreaterThan(0);
  expect(lit).toBeGreaterThan(0);
  expect(securityRail).toBeGreaterThan(0);
  expect(right[0].material).toBe(left[0].material);
  for (const fixture of left.slice(1)) expect(fixture.geometry.getAttribute('industrialSurface')).toBeUndefined();

  const seam = (geometry: BufferGeometry) => {
    const { industrialSurface, position } = geometry.attributes;
    const z = path.sample(210).p.z;
    const samples = new Set<string>();
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getZ(i) - z) > 1e-4 || industrialSurface.getZ(i) !== IndustrialSurface.Cast) continue;
      samples.add([position.getX(i), position.getY(i), industrialSurface.getW(i)]
        .map(value => Math.round(value * 1e5)).join(','));
    }
    return [...samples].sort();
  };
  const shared = seam(left[0].geometry);
  expect(shared.length).toBeGreaterThan(0);
  expect(seam(right[0].geometry)).toEqual(shared);
  for (const mesh of [...left, ...right]) mesh.geometry.dispose();
  facility.dispose();
});

test('DESCENT room air blends through authored boundaries independently of the security beat', () => {
  const zones = facilityZones(volume, 'standard');
  const room = new DescentFacility(new Path(120, 10, 'facility'), zones);
  const fog = new Color(), backdrop = new Color();
  const sample = (station: number, pulse = 0) => {
    const density = room.light(station, 314, { ...steadyLights, amount: 1, pulse }, fog, backdrop);
    return { density, fog: fog.clone(), backdrop: backdrop.clone() };
  };
  try {
    const middle = zones.map(({ start, finish }) => (start + finish) / 2);
    const control = sample(middle[0]), well = sample(middle[3]), core = sample(middle[4]);
    expect(well.density).toBeLessThan(core.density);
    expect(core.density).toBeLessThan(control.density);
    expect(well.backdrop.b).toBeGreaterThan(core.backdrop.b);
    const exitStart = sample(zones[6].start), exitEnd = sample(zones[6].finish);
    expect(exitEnd.backdrop.r).toBeGreaterThan(exitStart.backdrop.r);
    for (const station of [...middle, zones[6].finish]) {
      expect(sample(station, 0)).toEqual(sample(station, 1));
    }
    for (const { start } of zones.slice(1)) {
      const a = sample(start - .02), b = sample(start + .02);
      expect(Math.abs(b.density - a.density)).toBeLessThan(.0000015);
      expect(b.fog.r).toBeCloseTo(a.fog.r, 4);
      expect(b.backdrop.b).toBeCloseTo(a.backdrop.b, 4);
    }
  } finally {
    room.dispose();
  }
});

test('CONTROL has 24 continuous lighting phrases with independent groups and bounded warning accents', () => {
  const sample = (beat: number, amount = 1, reducedMotion = false) => {
    const cue = newControlLighting();
    controlLightingAt(beat, amount, cue, reducedMotion);
    return cue;
  };
  expect(controlLightPhrases).toHaveLength(controlTrack.bars / 4);
  const voices = new Set<number>();
  const levels = new Set<string>();
  for (let i = 0; i < controlLightPhrases.length; i++) {
    const center = sample(i * 16 + 8);
    expect(center.phrase).toBe(i);
    levels.add(center.gains.slice(0, 4).toString());
    if (i) {
      const before = sample(i * 16 - .0001), after = sample(i * 16 + .0001);
      expect(after.previous).toBe(before.phrase);
      for (const [group, value] of after.gains.entries()) expect(value).toBeCloseTo(before.gains[group], 3);
      expect(after.rim).toBeCloseTo(before.rim, 3);
      expect(after.paneGain).toBeCloseTo(before.paneGain, 3);
      expect(after.travel).toBeCloseTo(before.travel, 3);
    }
  }
  expect(levels.size).toBe(24);
  const low = [1, 1], high = [1, 1];
  for (let beat = 0; beat < controlTrack.beats; beat += .0625) {
    const cue = sample(beat);
    cue.accents.forEach((level, voice) => { if (level > .1) voices.add(voice); });
    for (const group of [ControlLamp.Roof, ControlLamp.Floor]) {
      low[group] = Math.min(low[group], cue.gains[group]);
      high[group] = Math.max(high[group], cue.gains[group]);
    }
    expect(cue.gains[ControlLamp.Route]).toBeCloseTo(neutralLampGains[ControlLamp.Route]);
    expect(cue.rim).toBeLessThan(.77);
  }
  expect(low.every(gain => gain < .42)).toBe(true);
  expect(high.every((gain, group) => gain - low[group] > .65 && gain < 1.8)).toBe(true);
  expect(voices.size).toBe(6);
  expect(sample(120).travel).toBeGreaterThan(.4);
  expect(sample(136).travel).toBeLessThan(-.4);
  expect(Math.abs(sample(264).gains[ControlLamp.Stator] - sample(271).gains[ControlLamp.Stator])).toBeGreaterThan(.24);
  expect(sample(328).relay).toBeGreaterThan(.4);
  expect(sample(377).relay).toBe(0);
  for (const beat of [0, 64, 128, 207, 271, 314, 377]) {
    const off = sample(beat, 0);
    expect(off).toMatchObject({ travel: 0, relay: 0, amount: 0 });
    expect(off.rim).toBeGreaterThan(.18);
    expect(off.paneGain).toBeGreaterThan(.95);
    expect(off.paneGain).toBeLessThan(1.18);
    expect(off.gains[ControlLamp.Route]).toBeCloseTo(neutralLampGains[ControlLamp.Route]);
  }
  const rest = sample(312, 0), answer = sample(316, 0);
  expect(rest.gains[ControlLamp.Roof] - answer.gains[ControlLamp.Roof]).toBeGreaterThan(.25);
  expect(answer.gains[ControlLamp.Floor] - rest.gains[ControlLamp.Floor]).toBeGreaterThan(.20);
  const reduced = sample(312, 1, true), reducedLater = sample(316, 1, true);
  expect(reduced).toMatchObject({ travel: 0, relay: 0, amount: 0, paneGain: 1 });
  expect(reduced.phrase).toBe(rest.phrase);
  expect(reducedLater.gains).toEqual(reduced.gains);
  expect(reducedLater.rim).toBe(reduced.rim);
});

test('service assemblies and the BREACH roof cap stay attached to their world stations across chunks', () => {
  const path = new Path(420, 10, 'facility');
  path.straight(420);
  const geometryKeys = (geometry: BufferGeometry) => {
    const { position, industrialSurface } = geometry.attributes;
    return Array.from({ length: position.count }, (_, i) =>
      [position.getX(i), position.getY(i), position.getZ(i), industrialSurface.getZ(i)].join(','));
  };
  for (const zone of facilityZones(volume, 'standard')) {
    const facility = new DescentFacility(path, [{ ...zone, start: 0, finish: 400, end: 420 }]);
    const whole = facility.build(174, 246), leading = facility.build(174, 204), trailing = facility.build(204, 246);
    try {
      expect([...geometryKeys(leading[0].geometry), ...geometryKeys(trailing[0].geometry)].sort(),
        zone.section).toEqual(geometryKeys(whole[0].geometry).sort());
      if (zone.name === 'BREACH') {
        const before = path.sample(203.5), after = path.sample(204.5);
        const roof = (frame: typeof before) => new Raycaster(frame.p, frame.u).intersectObject(whole[0]);
        expect(roof(before)).not.toHaveLength(0);
        expect(roof(after)).toHaveLength(0);
      }
    } finally {
      for (const mesh of [...whole, ...leading, ...trailing]) {
        if (mesh instanceof InstancedMesh) mesh.dispose();
        mesh.geometry.dispose();
      }
      facility.dispose();
    }
  }
});

test('spatial cues enrich their rooms without requiring Dynamic Lights', () => {
  expect(controlSetpieceAt(214, 0, false)).toMatchObject({ motion: .68, shaft: 1, precharge: 0, release: 0 });
  expect(controlSetpieceAt(256, 1, false)).toMatchObject({ motion: 1, shaft: 0, precharge: 0, release: 0 });
  expect(controlSetpieceAt(282, 0, false).precharge).toBeGreaterThan(.7);
  expect(controlSetpieceAt(300, 0, false).precharge).toBe(0);
  expect(controlSetpieceAt(353, 0, false).release).toBeLessThan(controlSetpieceAt(368, 0, false).release);
  expect(controlSetpieceAt(376, 1, true)).toMatchObject({ motion: 0, release: 1 });
});

test.each(['standard', 'sightseeing'] as const)('shaft and stator optics keep their depth and phase across %s chunks', mode => {
  const path = buildRunPath(volume, mode), zones = facilityZones(volume, mode);
  const facility = new DescentFacility(path, zones);
  const rows = (from: number, to: number) => {
    const meshes = facility.build(from, to);
    const optics = meshes.find(mesh => mesh instanceof InstancedMesh) as InstancedMesh | undefined;
    try {
      if (!optics) return [];
      const { lightSpan: span, lightCue: cue } = optics.geometry.attributes;
      return Array.from({ length: optics.count }, (_, i) =>
        [span.getX(i), Math.floor(span.getW(i)), span.getW(i), cue.getY(i), cue.getZ(i)].join(','));
    } finally {
      for (const mesh of meshes) {
        if (mesh instanceof InstancedMesh) mesh.dispose();
        mesh.geometry.dispose();
      }
    }
  };
  try {
    for (const [room, shape, depth] of [[3, FacilityLightShape.Rake, 2], [4, FacilityLightShape.Stator, 1]]) {
      const zone = zones[room], split = (zone.start + zone.finish) / 2;
      const whole = rows(zone.start, zone.finish);
      expect([...rows(zone.start, split), ...rows(split, zone.finish)].sort()).toEqual(whole.sort());
      const layers = whole.map(row => row.split(',').map(Number));
      expect(layers.every(([, style]) => style === shape)).toBe(true);
      expect(new Set(layers.map(layer => layer[4]))).toEqual(new Set(Array.from({ length: depth + 1 }, (_, i) => i)));
    }
  } finally { facility.dispose(); }
});

test('HOLD and BREACH work strips are recessed into their collars and stop when the collars do', () => {
  const path = new Path(200, 10, 'facility');
  path.straight(200);
  const zones = facilityZones(volume, 'standard');
  for (const { section, mounted, bare } of [
    { section: 'HOLD', mounted: [2, 56], bare: [29, 83] },
    { section: 'BREACH', mounted: [47, 92], bare: [137, 182] },
  ]) {
    const zone = zones.find(zone => zone.section === section)!;
    const room = new DescentFacility(path, [{ ...zone, start: 0, finish: 200, end: 200 }]);
    const [metal, fixtures, security] = room.build(0, 200);
    try {
      for (const station of [...mounted, ...bare]) {
        const frame = path.sample(station);
        for (const side of [-1, 1]) for (const level of [-1, 1]) {
          const ray = new Raycaster(frame.p.clone().addScaledVector(frame.r, side * 1.45),
            frame.u.clone().multiplyScalar(level), 0, 4);
          const hits = ray.intersectObject(fixtures);
          if (bare.includes(station)) {
            expect(hits, section + ' at ' + station).toHaveLength(0);
            continue;
          }
          const [contact] = ray.intersectObject(metal);
          expect(hits).not.toHaveLength(0);
          expect(contact.distance).toBeGreaterThan(hits[0].distance);
          expect(contact.distance).toBeLessThan(hits.at(-1)!.distance);
        }
      }
    } finally {
      for (const mesh of [metal, fixtures, security]) mesh.geometry.dispose();
      room.dispose();
    }
  }
});

test('CONTROL accents anchor 161 gates with clear chapter and movement roles', () => {
  const chart = chartFor(volume, 'normal');
  const perSection = (name: string) => chart.filter(gate => gate.section === name);
  const accents = new Set(controlEvents.filter(event => event.voice === 'kick' || event.voice === 'snare' || event.voice === 'ghost')
    .map(event => Math.round(event.at / step) / 4));
  expect(volume.sections.map(({ name }) => perSection(name).length)).toEqual([8, 28, 29, 40, 5, 40, 11]);
  expect(chart.every((gate, i) => accents.has(gate.beat) && (i === 0 || gate.beat - chart[i - 1].beat >= 1.25))).toBe(true);
  expect(chart.at(0)!.beat).toBe(6);
  expect(chart.at(-1)!.beat).toBe(372);
  expect(new Set(chart.filter(gate => gate.kind === 'laser-matrix').map(gate => gate.sector)).size).toBe(8);
  for (const section of ['ORDER', 'LOCK', 'LOCKDOWN']) {
    expect(perSection(section).filter(gate => gate.kind === 'laser-matrix').length).toBeGreaterThan(perSection(section).length * .45);
  }
  expect(perSection('FLIGHT').filter(gate => gate.kind === 'laser-slice').length).toBeGreaterThan(20);
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

const descentRuns = [
  ...difficulties.map(mode => ({ mode, route: 'main' as const, seed: 0 })),
  ...([0, 1] as const).flatMap(seed => (['challenge', 'score'] as const).flatMap(route =>
    (['hard', 'sightseeing'] as const).map(mode => ({ mode, route, seed })))),
  { mode: 'sightseeing', route: 'main', seed: 0 },
] as const;

test.each(['standard', 'sightseeing'] as const)('TRANSFER stages in %s leave the approach, turnout and merge free of gates', mode => {
  const sim = new Simulation(volume);
  sim.start('normal', 0, 'shield', mode);
  const path = sim.junctionPath!;
  const scenic = mode === 'sightseeing';
  const lead = sim.mainGates.filter(gate => gate.worldStation < path.split).at(-1)!;
  const shared = sim.mainGates.find(gate => gate.worldStation >= path.end)!;
  expect(lead.beat).toBe(scenic ? 125 : 126.5);
  expect(lead.worldStation).toBeLessThan(path.guideStart);
  expect(path.split - lead.worldStation).toBeCloseTo(scenic ? 69.6 : 186.3, 2);
  expect(shared.beat).toBe(scenic ? 173 : 169);
  expect(shared.worldStation - path.end).toBeGreaterThanOrEqual(29.99);
  if (!scenic) expect(lanePoint(shared.kind, shared.open, shared.axis)).toEqual([0, 0]);
  for (const [i, route] of (['main', 'challenge', 'score'] as const).entries()) {
    const gates = sim.branchGates![route];
    expect(gates[0].beat).toBe((scenic ? [147, 147, 149] : [145, 145, 146])[i]);
    expect(gates[0].worldStation + 1e-8).toBeGreaterThanOrEqual(path.open);
    expect(gates.at(-1)!.beat).toBeLessThanOrEqual(descentJunction.merge[mode] - 2);
  }
});

test.each(descentRuns)('$mode $route seed $seed completes with real 60 Hz steering at cruise and Boost', ({ mode, route, seed }) => {
  const difficulty = mode === 'sightseeing' ? 'normal' : mode;
  const chart = chartFor(volume, difficulty);
  expect(new Set(chart.map(gate => gate.kind))).toEqual(new Set(descentGateKinds));
  expect(chart.at(-1)!.beat).toBeLessThanOrEqual(372);
  for (const boost of ['cruise', 'continuous', 'intervals']) {
    const sim = new Simulation(volume, undefined, undefined, mode === 'sightseeing' ? mode : 'standard');
    sim.start(difficulty, seed, 'lumen', mode === 'sightseeing' ? mode : 'standard');
    const side = routeSides.find(side => branchLayout(seed)[side] === route)!;
    const path = sim.junctionPath!;
    const chosen = [...sim.mainGates, ...sim.branchGates![route]].sort((a, b) => a.worldStation - b.worldStation);
    if (route === 'main' && mode !== 'sightseeing') expect(chosen.map(gate => [gate.beat, gate.kind, gate.open, gate.axis]))
      .toEqual(chart.map(gate => [gate.beat, gate.kind, gate.sector, gate.axis]));
    let lastCrossing = -Infinity;
    let recognizedAt: number | undefined, committedAt: number | undefined;
    const axis = (delta: number) => Math.abs(delta) < .08 ? 0 : Math.sign(delta);
    while (sim.phase === 'playing') {
      const previous = sim.gatesJudged;
      const gate = chosen[previous];
      const steer = gate && sim.time >= lastCrossing + .15 - 1e-9;
      if (sim.routeGuide) recognizedAt ??= sim.time;
      if (sim.route) committedAt ??= sim.time;
      const [x, y] = !steer ? [sim.camera.tx, sim.camera.ty]
        : !sim.route && gate.worldStation > path.split ? [
          sim.time - (recognizedAt ?? Infinity) < .5 ? 0 : side === 'left' ? -3.15 : side === 'right' ? 3.15 : 0, 0,
        ]
        : sim.pickup?.status === 'pending' && sim.pickupVisible && gate.worldStation > sim.pickupStation ? [0, 0]
        : lanePoint(gate.kind, gate.open, gate.axis);
      const boosting = boost === 'continuous' || (boost === 'intervals' && sim.time % 6 < 2.5);
      sim.step(STEP, { ...idleInput, boosting, axisX: axis(x - sim.camera.tx), axisY: axis(y - sim.camera.ty) });
      if (previous === sim.gatesJudged) continue;
      lastCrossing = sim.mainGates[previous].crossedAt!;
      expect(sim.gatesPassed, `${mode} ${boost} missed ${gate.kind} at ${gate.beat} on ${sim.route} ` +
        `(${sim.camera.x.toFixed(2)}, ${sim.camera.y.toFixed(2)} → ${x}, ${y})`).toBe(previous + 1);
    }
    const lastBefore = chosen.filter(gate => gate.worldStation < path.split).at(-1)!;
    expect(recognizedAt! - lastBefore.crossedAt!).toBeGreaterThan(.4);
    expect(committedAt! - recognizedAt!).toBeGreaterThan(3.25);
    expect(sim.branchGates![route][0].crossedAt! - committedAt!).toBeGreaterThan(1.8);
    expect(sim.result).toMatchObject({ title: 'ESCAPED', unreached: 0, accuracy: 1, route });
    expect(sim.pickup?.status).toBe(route === 'score' ? 'collected' : undefined);
  }
});

test.each(['standard', 'sightseeing'] as const)('TRANSFER in %s crosses above and below the main axis with clear flight envelopes', mode => {
  const sim = new Simulation(volume);
  sim.start('normal', 0, 'shield', mode);
  const path = sim.junctionPath!;
  const mid = (path.split + path.end) / 2;
  const center = path.sample(mid, 'center');
  const left = path.sample(mid, 'left'), right = path.sample(mid, 'right');
  expect(left.p.clone().sub(center.p).dot(center.u)).toBeCloseTo(-path.spec.spacing);
  expect(right.p.clone().sub(center.p).dot(center.u)).toBeCloseTo(path.spec.spacing);
  expect(path.sample(path.open, 'left').p.clone().sub(path.sample(path.open, 'center').p)
    .dot(center.r)).toBeLessThan(-10);
  expect(path.sample(path.merge, 'left').p.clone().sub(path.sample(path.merge, 'center').p)
    .dot(center.r)).toBeGreaterThan(10);
  const facility = new DescentFacility(sim.path, facilityZones(volume, mode));
  const junction = facility.junction(path, sim.branch!.layout);
  const chase = junction.group.getObjectByName('descent-transfer-chase') as InstancedMesh;
  const { lightSpan, lightCue } = chase.geometry.attributes;
  const routeLayers = new Set<number>();
  for (let i = 0; i < chase.count; i++) {
    expect(Math.floor(lightSpan.getW(i))).toBe(FacilityLightShape.Transfer);
    expect(lightSpan.getY(i)).toBeGreaterThan(0);
    routeLayers.add(lightCue.getZ(i));
  }
  expect(routeLayers).toEqual(new Set([0, 1, 2]));
  const disposed = new Set();
  chase.addEventListener('dispose', () => disposed.add(chase));
  chase.geometry.addEventListener('dispose', () => disposed.add(chase.geometry));
  const bothFaces = new MeshBasicMaterial({ side: DoubleSide });
  const blockers = junction.group.children.filter(child => child !== chase).map(child => new Mesh((child as Mesh).geometry, bothFaces));
  for (const side of routeSides) {
    const checkClear = (s: number, x: number, y: number) => {
      const from = path.sample(s - 1, side), to = path.sample(s + 1, side);
      const start = from.p.addScaledVector(from.r, x).addScaledVector(from.u, y);
      const ray = to.p.addScaledVector(to.r, x).addScaledVector(to.u, y).sub(start);
      expect(new Raycaster(start, ray.clone().normalize(), 0, ray.length()).intersectObjects(blockers),
        `${side} at ${s.toFixed(2)} (${x}, ${y})`).toHaveLength(0);
      expect(new Raycaster(start, ray.clone().normalize(), 0, ray.length()).intersectObject(chase)).toHaveLength(0);
    };
    for (const boundary of [path.split, path.end]) {
      expect(path.sample(boundary - .02, side).p.distanceTo(path.sample(boundary + .02, side).p)).toBeCloseTo(.04, 6);
      expect(path.sample(boundary - .02, side).f.angleTo(path.sample(boundary + .02, side).f)).toBeLessThan(1e-4);
    }
    for (let s = path.start + 1; s < path.end - 1; s += 2) {
      checkClear(s, 0, 0);
      const arc = path.arcAt(s, side);
      expect(path.stationAt(arc, side)).toBeCloseTo(s, 7);
    }
    for (const gate of sim.branchGates![sim.branch!.layout[side]]) {
      checkClear(gate.worldStation, ...lanePoint(gate.kind, gate.open, gate.axis));
    }
  }
  const cargoStation = path.distanceAt(descentCargo.beat);
  expect(Math.min(...sim.branchGates!.score.map(gate => Math.abs(cargoStation - gate.worldStation)))).toBeGreaterThan(12);
  junction.dispose();
  expect(disposed).toEqual(new Set([chase, chase.geometry]));
  bothFaces.dispose();
  facility.dispose();
});
