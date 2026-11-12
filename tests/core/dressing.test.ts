import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { SECTION } from '../../app/game/core/collision';
import { structureKinds } from '../../app/game/core/dressing';
import { ARCH_MODULE, ARCH_ORIGIN, ARCH_RING, SLOT_LENGTH, SLOT_SPACING, WALL_MOUNT, WALL_RECESS,
  dressingClearances, makeScenicPlan, socketHalf, zoneAt } from '../../app/game/core/scenic-plan';
import { corridorLength } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { pathFrame } from '../../app/game/graphics/branch-path';
import { buildPath } from '../../app/game/graphics/path';
import { MaterialLibrary } from '../../app/game/graphics/materials/library.client';
import { buildDressingModel } from '../../app/game/graphics/dressing-kit.client';
import { Tunnel } from '../../app/game/graphics/tunnel.client';

const volume = volumeById('elsewhere');
const path = buildPath(corridorLength(volume), 150, 46, volume.topology);
const plan = makeScenicPlan(volume, path);

test.each(['standard', 'sightseeing'] as const)('%s uses authored architectural zones, a global grid and protected junctions', mode => {
  const again = buildPath(corridorLength(volume), 150, 46, volume.topology);
  const result = makeScenicPlan(volume, path, mode);
  expect(makeScenicPlan(volume, again, mode)).toEqual(result);
  expect(new Set(result.placements.map(p => p.kind))).toEqual(new Set(structureKinds));
  expect(new Set(result.placements.map(p => p.id)).size).toBe(result.placements.length);
  expect(result.zones.filter(z => z.kind === 'ceiling-pair')).toHaveLength(1);
  expect(result.zones.filter(z => z.kind === 'ordered-rhythm')).toHaveLength(1);
  const { junctions, pickups } = dressingClearances(volume, mode);
  for (const [i, zone] of result.zones.entries()) {
    if (i) expect(zone.startStation).toBe(result.zones[i - 1].endStation);
    expect((zone.startStation - ARCH_ORIGIN) % ARCH_RING || 0).toBe(0);
    expect(zoneAt(result, zone.startStation)).toBe(zone);
    const lamps = result.lamps.filter(lamp => lamp.zone === zone.id);
    if (!zone.groups.length) {
      expect(lamps).toHaveLength(0);
      continue;
    }
    expect(path.straightBetween(zone.startStation, zone.endStation)).toBeTruthy();
    expect(lamps).toHaveLength(2 * (zone.endStation - zone.startStation) / SLOT_SPACING);
    for (let pair = 0; pair < lamps.length; pair += 2) {
      const [left, right] = lamps.slice(pair, pair + 2);
      expect([left.station, left.side, right.station, right.side]).toEqual([
        zone.startStation + SLOT_LENGTH / 2 + pair / 2 * SLOT_SPACING, 0, left.station, 1,
      ]);
      expect([left.group, right.group]).toEqual(zone.kind === 'ordered-rhythm' ? [0, 1] : [0, 0]);
    }
  }
  for (const p of result.placements) {
    const half = socketHalf(p.kind);
    expect(path.straightBetween(p.station - half, p.station + half)).toBeTruthy();
    expect(junctions.every(([lo, hi]) => p.station + half < lo || p.station - half > hi)).toBe(true);
    expect(pickups.every(pickup => Math.abs(pickup - p.station) > 18 + half)).toBe(true);
    if (p.mount === 'ceiling') {
      expect((p.station - ARCH_ORIGIN) % ARCH_MODULE || 0).toBe(0);
      expect(p.y).toBe(SECTION.b);
    } else {
      expect((p.station - ARCH_ORIGIN) % ARCH_MODULE).toBe(ARCH_MODULE / 2);
      expect(Math.abs(p.x)).toBe(SECTION.a + WALL_MOUNT);
      expect(result.placements.some(q => q.station === p.station && q.kind === p.kind && q.x === -p.x)).toBe(true);
    }
  }
  for (const id of ['drift', 'descent', 'orbit']) expect(makeScenicPlan(volumeById(id), path).placements).toEqual([]);
});

test('the opaque models sit behind the wall faces and meet the pocket backing', () => {
  const library = new MaterialLibrary();
  try {
    for (const kind of structureKinds) {
      const parts = buildDressingModel(kind, library);
      let nearestBack = 0;
      for (const { geometry, material } of parts) {
        expect(material.name).not.toBe('');
        expect(material.type).toBe('MeshStandardMaterial');
        const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
        for (let i = 0; i < positions.count; i++) {
          const [x, y, z] = [positions.getX(i), positions.getY(i), positions.getZ(i)];
          const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
          expect([x, y, z, length].every(Number.isFinite) && length > .96 && length < 1.04).toBe(true);
          if (kind === 'overhead-assembly') {
            expect(y + SECTION.b).toBeGreaterThan(2.64);
          } else {
            const outward = WALL_MOUNT - z;
            nearestBack = Math.max(nearestBack, outward);
            expect(outward >= .025 && outward <= WALL_RECESS + .012).toBe(true);
            expect(Math.abs(x)).toBeLessThan(socketHalf(kind) - .25);
            expect(Math.abs(y)).toBeLessThan(1.39);
          }
        }
        geometry.dispose();
      }
      if (kind !== 'overhead-assembly') expect(nearestBack - WALL_RECESS).toBeGreaterThanOrEqual(0);
    }
  } finally { library.dispose(); }
});

test('real shell recess profiles and texture phase match across a streamed split', () => {
  const library = new MaterialLibrary(), tunnel = new Tunnel(library, path, volume.topology);
  tunnel.setArchitecture(plan);
  try {
    const socket = plan.placements.find(p => p.kind === 'ventilation-assembly')!;
    for (const [station, kind] of [[socket.station, 'socket'], [plan.lamps[0].station, 'slot']] as const) {
      const sample = path.sample(station, pathFrame());
      const vertices = (lo: number, hi: number) => {
        const chunk = tunnel._buildChunk(lo, hi);
        const shell = chunk.meshes.find(m => m.name === 'tunnel-shell')!.geometry;
        const p = shell.getAttribute('position'), uv = shell.getAttribute('uv');
        const set = new Set<string>();
        for (let i = 0; i < p.count; i++) {
          const v = new Vector3().fromBufferAttribute(p, i).sub(sample.p);
          if (Math.abs(v.dot(sample.f)) > .002) continue;
          const x = v.dot(sample.r), y = v.dot(sample.u);
          if (kind === 'socket' ? Math.abs(x) > SECTION.a + .30 : y > SECTION.b + .10) {
            set.add([x, y, uv.getX(i), uv.getY(i)].map(v => v.toFixed(3)).join(':'));
          }
        }
        chunk.meshes.forEach(m => m.geometry.dispose());
        return set;
      };
      const before = vertices(station - ARCH_RING, station), after = vertices(station, station + ARCH_RING);
      expect(before.size).toBeGreaterThan(0);
      expect(after).toEqual(before);
    }
  } finally { tunnel.dispose(); library.dispose(); }
});
