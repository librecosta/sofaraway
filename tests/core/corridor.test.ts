import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { playModes } from '../../app/game/contracts';
import { FixedStepClock, STEP } from '../../app/game/core/clock';
import { curveCurvature, curveOffset } from '../../app/game/core/corridor-composition';
import { idleInput } from '../../app/game/core/input';
import { circumference, corridorAt, helixPitch, makeLightingAtlas, perimeter, wallSpans, washCenter,
  washFaceProjection, washPitch, washWidth } from '../../app/game/core/lighting-atlas';
import { BOOST_MULTIPLIER, cruiseTarget, modeScale, referenceFor } from '../../app/game/core/reference-track';
import { Simulation } from '../../app/game/core/simulation';
import type { RunGate } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { BranchPath } from '../../app/game/graphics/branch-path';
import { CorridorLights } from '../../app/game/graphics/corridor-lights.client';
import { buildPath, buildRunPath } from '../../app/game/graphics/path';
import { MaterialLibrary } from '../../app/game/graphics/materials/library.client';
import { Tunnel } from '../../app/game/graphics/tunnel.client';

const volume = volumeById('elsewhere');
const reference = referenceFor(volume);

test.each(playModes)('%s uses exact curve stations, arc-length and continuous orthogonal frames', mode => {
  const path = buildRunPath(volume, mode);
  const curve = path.segments.find(seg => seg.type === 's-curve')!;
  const entry = path.sample(curve.s0), exit = path.sample(curve.s1);
  expect(curve.s0).toBe(reference.station(208, mode));
  expect(curve.s1).toBe(reference.station(248, mode));
  expect(curve.arc.at(-1)).toBeCloseTo(curve.s1 - curve.s0, 7);
  expect(curve.amplitude).toBeCloseTo(101.117 * modeScale(mode), 10);
  expect(exit.p.clone().sub(entry.p).distanceTo(entry.f.clone().multiplyScalar(curve.depth))).toBeLessThan(1e-9);
  let length = 0, curvature = 0, last = entry.p;
  for (let i = 1; i <= 8192; i++) {
    const ratio = i / 8192;
    const frame = path.sample(curve.s0 + (curve.s1 - curve.s0) * ratio);
    length += frame.p.distanceTo(last);
    last = frame.p;
    const error = Math.max(Math.abs(frame.f.dot(frame.r)), Math.abs(frame.r.dot(frame.u)), Math.abs(frame.f.dot(frame.u)));
    expect(error).toBeLessThan(1e-12);
    expect(frame.r.clone().cross(frame.f).distanceTo(frame.u)).toBeLessThan(1e-12);
    curvature = Math.max(curvature, curveCurvature(ratio, curve.depth, curve.amplitude));
  }
  expect(length).toBeCloseTo(curve.s1 - curve.s0, 4);
  const yaw = curvature * cruiseTarget(Infinity) * modeScale(mode) * BOOST_MULTIPLIER * 180 / Math.PI;
  expect(yaw).toBeCloseTo(47.71, 2);
  for (const seg of path.segments.slice(0, -1)) {
    const before = path.sample(seg.s1 - 1e-5), after = path.sample(seg.s1 + 1e-5);
    expect(before.p.distanceTo(after.p)).toBeLessThan(.000021);
    expect(before.f.distanceTo(after.f)).toBeLessThan(1e-6);
  }
  expect(path.sample(curve.s0 + curve.arc[341]).p.clone().sub(entry.p).dot(entry.r))
    .toBeCloseTo(curve.amplitude * curveOffset(1 / 3), 3);
  expect(path.sample(curve.s0 + curve.arc[683]).p.clone().sub(entry.p).dot(entry.r))
    .toBeCloseTo(-curve.amplitude * curveOffset(1 / 3), 3);
  expect(path.sample(curve.s0 + curve.arc[512]).p.distanceTo(entry.p.clone().lerp(exit.p, .5))).toBeLessThan(1e-8);
  console.log('CORRIDOR ' + JSON.stringify({ mode, start: curve.s0, end: curve.s1, length, depth: curve.depth,
    amplitude: curve.amplitude, offset: curve.amplitude * curveOffset(1 / 3), curvature, yaw,
    cruiseYaw: yaw / BOOST_MULTIPLIER }));
});

test.each(playModes)('%s installs a deterministic six-theme atlas on the actual octagon', mode => {
  const path = buildRunPath(volume, mode);
  const atlas = makeLightingAtlas(volume, mode);
  expect(makeLightingAtlas(volume, mode)).toEqual(atlas);
  expect(new Set(atlas.map(zone => zone.kind)).size).toBe(6);
  expect(circumference).toBeCloseTo(23.988225, 6);
  for (const corner of perimeter.slice(0, -1)) {
    const [[, a], [b]] = wallSpans(corner, .91);
    expect(a.edge).not.toBe(b.edge);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-12);
  }
  for (const zone of atlas) {
    expect(corridorAt(atlas, zone.start)).toBe(zone);
    expect(corridorAt(atlas, zone.end)).not.toBe(zone);
    if (zone.kind === 'pure-frame') {
      expect(zone.lights).toHaveLength(0);
      continue;
    }
    expect(path.straightBetween(zone.start, zone.end)).toBeTruthy();
    expect(zone.end - zone.start).toBeGreaterThan(140);
    for (const light of zone.lights) {
      expect(light.start >= zone.start && light.end <= zone.end && light.level > 0 && light.level <= 1).toBe(true);
      const [a, b] = light.entry, [c, d] = light.exit;
      expect(new Set([a.edge, b.edge, c.edge, d.edge]).size).toBe(1);
      expect((a.x - d.x) * a.nx + (a.y - d.y) * a.ny).toBeCloseTo(0, 10);
    }
    if (zone.kind === 'helical-wash') {
      const pitch = washPitch(mode);
      const project = ({ x, y, edge }: ReturnType<typeof wallSpans>[number][number]) => {
        const [tx, ty, origin] = washFaceProjection[edge];
        return x * tx + y * ty + origin;
      };
      for (const phase of [0, 1, 2, 3, 4]) {
        const centers = ([0, 1] as const).map(strand => wallSpans(washCenter(phase * pitch / 4, pitch, strand), .01)[0][0].edge);
        expect(centers).toEqual([[7, 3], [1, 5], [3, 7], [5, 1], [7, 3]][phase]);
      }
      for (let s = zone.start; s < zone.end; s += 1.75) {
        const tiles = zone.lights.filter(light => light.start <= s && s < light.end);
        for (const strand of [0, 1] as const) {
          for (const [lo, hi] of wallSpans(washCenter(s - zone.start, pitch, strand), washWidth)) {
            expect(tiles.some(({ entry: [a, b] }) => a.edge === lo.edge &&
              project(a) <= project(lo) + 1e-9 && project(b) >= project(hi) - 1e-9)).toBe(true);
          }
        }
      }
    }
    if (zone.kind === 'raked-bands') {
      for (let i = 0; i < zone.lights.length; i += 2) {
        const [left, right] = zone.lights.slice(i, i + 2);
        expect(right.start).toBe(left.start);
        expect(right.end).toBe(left.end);
        const lengths = [5.5, 4.5, 4.5, 4], rises = [-.27, .525, -.7, 1.1];
        const phase = (i / 2) % 4;
        expect(left.start - zone.start).toBeCloseTo(2.5 + i * 5, 9);
        expect(left.end - left.start).toBeCloseTo(lengths[phase], 9);
        expect([left.entry[0].edge, right.entry[0].edge]).toEqual([6, 2]);
        const centerY = (pair: typeof left.entry) => (pair[0].y + pair[1].y) / 2;
        expect(centerY(left.exit) - centerY(left.entry)).toBeCloseTo(rises[phase] * .966, 9);
        expect(centerY(right.entry)).toBeCloseTo(centerY(left.entry), 9);
        expect(centerY(right.exit)).toBeCloseTo(centerY(left.exit), 9);
      }
    }
    if (zone.kind === 'triple-helix') {
      for (let s = zone.start + 4.5; s + .15 < zone.end; s += 9) {
        const spans = Array.from({ length: 3 }, (_, strand) =>
          wallSpans(circumference * ((s - zone.start) / helixPitch(mode) + strand / 3), .91)).flat();
        expect(zone.lights.filter(light => light.start === s - .049).map(light => light.entry))
          .toEqual(spans);
      }
    }
    if (zone.kind === 'connected-flow') {
      for (const group of [0, 1]) {
        const strips = zone.lights.filter(light => light.group === group);
        for (let i = 1; i < strips.length; i++) {
          expect(strips[i - 1].end).toBe(strips[i].start);
          expect(strips[i - 1].exit).toEqual(strips[i].entry);
        }
      }
    }
  }
  expect(corridorAt(atlas, reference.station(90, mode))).toBeUndefined();
  console.log('ATLAS ' + JSON.stringify({ mode, zones: atlas.map(zone => [zone.kind, zone.start, zone.end, zone.lights.length]) }));
});

test('both modes have distinct shared base paths and unchanged gate stations across refresh rates', () => {
  const run = (mode: typeof playModes[number], hz: number, boost: boolean) => {
    const sim = new Simulation(volume, { align: true, branchSide: 'right' });
    const clock = new FixedStepClock();
    sim.start('normal', 0, 'lumen', mode);
    expect(sim.junctionPath?.base).toBe(sim.path);
    const curve = sim.path.segments.find(seg => seg.type === 's-curve')!;
    const gates = (Reflect.get(sim, 'chart') as RunGate[]).filter(g => g.worldStation >= curve.s0 && g.worldStation < curve.s1);
    for (let i = 0; sim.phase === 'playing' && i <= 210 * hz; i++) {
      clock.consume(i / hz, () => sim.step(STEP, { ...idleInput, boosting: boost }));
    }
    expect(sim.result?.title).toBe('ESCAPED');
    expect(new Set(gates.map(g => g.kind))).toEqual(new Set(['iris', 'square', 'diamond']));
    expect(gates.every(g => g.judged && !g.hit && g.worldStation === reference.station(g.beat, mode))).toBe(true);
    return { gates: gates.map(g => [g.worldStation, g.crossedAt]), position: sim.path.sample(sim.trackDistance).p.toArray() };
  };
  for (const mode of playModes) {
    const standard = run(mode, 60, false);
    expect(run(mode, 120, false)).toEqual(standard);
    expect(run(mode, 144, false)).toEqual(standard);
    const boosted = run(mode, 60, true);
    boosted.gates.forEach(([station, time], i) => {
      expect(station).toBe(standard.gates[i][0]);
      expect(time!).toBeLessThan(standard.gates[i][1]!);
    });
  }
  const sim = new Simulation(volume);
  const standard = sim.path;
  sim.start('normal', 0, 'lumen', 'sightseeing');
  expect(sim.path).not.toBe(standard);
  expect(sim.junctionPath?.base).toBe(sim.path);
  sim.returnToMenu();
  sim.start('normal', 0, 'lumen', 'standard');
  expect(sim.path).toBe(standard);
});

test.each(playModes)('%s shell and UV phase meet across chunk cuts through the S-curve', mode => {
  const path = buildRunPath(volume, mode);
  const library = new MaterialLibrary(), tunnel = new Tunnel(library, path, volume.topology);
  try {
    for (const beat of [208, 223, 228, 241, 248]) {
      const station = reference.station(beat, mode);
      const sample = path.sample(station);
      const vertices = (lo: number, hi: number) => {
        const chunk = tunnel._buildChunk(lo, hi);
        const shell = chunk.meshes.find(m => m.name === 'tunnel-shell')!.geometry;
        const p = shell.getAttribute('position'), uv = shell.getAttribute('uv');
        const set = new Set<string>();
        for (let i = 0; i < p.count; i++) {
          const v = new Vector3().fromBufferAttribute(p, i).sub(sample.p);
          if (Math.abs(v.dot(sample.f)) > .001) continue;
          set.add([p.getX(i), p.getY(i), p.getZ(i), uv.getX(i), uv.getY(i)].join(':'));
        }
        tunnel._disposeChunk(chunk);
        return set;
      };
      const before = vertices(station - 3, station), after = vertices(station, station + 3);
      expect(before.size).toBeGreaterThanOrEqual(8);
      expect(after).toEqual(before);
    }
  } finally { tunnel.dispose(); library.dispose(); }
});

test.each(playModes)('%s preserves the legacy split, merge and per-route arc mapping', mode => {
  const composed = new BranchPath(buildRunPath(volume, mode), reference, mode);
  const legacy = new BranchPath(buildPath(composed.end + 200), reference, mode);
  expect([composed.start, composed.split, composed.end]).toEqual([legacy.start, legacy.split, legacy.end]);
  for (let s = composed.split; s < composed.end + 20; s += 1.25) {
    for (const side of ['left', 'center', 'right'] as const) {
      expect(composed.arcAt(s, side)).toBeCloseTo(legacy.arcAt(s, side), 7);
    }
  }
});

test.each(playModes)('%s keeps the installed lighting window within the batch budget', mode => {
  const path = buildRunPath(volume, mode), atlas = makeLightingAtlas(volume, mode);
  const lights = new CorridorLights(path, atlas, mode);
  try {
    let maxBatches = 0, maxFixtures = 0;
    for (let station = 4200; station < atlas.at(-1)!.end + 16; station++) {
      lights.update(station, 192);
      maxBatches = Math.max(maxBatches, lights.batches);
      maxFixtures = Math.max(maxFixtures, lights.count);
    }
    expect(maxBatches).toBeLessThanOrEqual(5);
    expect(maxFixtures).toBeLessThanOrEqual(280);
  } finally { lights.dispose(); }
});
