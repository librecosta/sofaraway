import { expect, test } from 'vitest';
import { SECTION } from '../../app/game/core/collision';
import { structureKinds } from '../../app/game/core/dressing';
import { dressingClearances, makeScenicPlan } from '../../app/game/core/scenic-plan';
import { corridorLength } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { buildPath } from '../../app/game/graphics/path';
import { MaterialLibrary } from '../../app/game/graphics/materials/library.client';
import { buildDressingModel, createKitLight } from '../../app/game/graphics/dressing-kit.client';

const volume = volumeById('elsewhere');
const path = buildPath(corridorLength(volume), 150, 46, volume.topology);
const plan = makeScenicPlan(volume, path).placements;

test.each(['standard', 'sightseeing'] as const)('%s world installations are wall or ceiling mounted and respect safety zones', mode => {
  const again = buildPath(corridorLength(volume), 150, 46, volume.topology);
  const result = makeScenicPlan(volume, path, mode);
  expect(makeScenicPlan(volume, again, mode)).toEqual(result);
  expect(new Set(result.placements.map(p => p.kind))).toEqual(new Set(structureKinds));
  expect(new Set(result.placements.map(p => p.id)).size).toBe(result.placements.length);
  expect(new Set(result.lamps.map(p => p.family)).size).toBe(6);
  const { junctions, pickups, gates } = dressingClearances(volume, mode);
  for (const p of result.placements) {
    expect(path.segments.some(s => s.type === 'straight' && s.s0 + 5 < p.station && p.station < s.s1 - 7)).toBe(true);
    expect(junctions.every(([lo, hi]) => p.station < lo || p.station > hi)).toBe(true);
    expect(pickups.every(pickup => Math.abs(pickup - p.station) > 23)).toBe(true);
    expect(gates.every(gate => Math.abs(gate - p.station) > 2.5)).toBe(true);
    expect(p.mount === 'ceiling' ? p.y : Math.abs(p.x)).toBe(p.mount === 'ceiling' ? SECTION.b : SECTION.a);
  }
  for (const id of ['drift', 'descent', 'orbit']) expect(makeScenicPlan(volumeById(id), path).placements).toEqual([]);
});

test('all five real models have finite triangles and installation envelopes outside the flight lane', () => {
  const library = new MaterialLibrary();
  const light = createKitLight();
  for (const kind of structureKinds) {
    const parts = buildDressingModel(kind, library, light);
    const envelope = plan.find(p => p.kind === kind)!;
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.length).toBeLessThanOrEqual(5);
    const emitter = parts.find(part => part.material === light)!;
    expect(emitter.geometry.getAttribute('color').count).toBeGreaterThan(20);
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
  light.dispose();
  library.dispose();
});
