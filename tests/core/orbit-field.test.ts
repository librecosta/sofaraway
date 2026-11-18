import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { ORBIT_CELL, ORBIT_CLEARANCE, ORBIT_LENGTH, ORBIT_MAX_RADIUS, OrbitField, orbitPreview } from '../../app/game/core/orbit-field';
import { orbitRockGeometry, ROCK_LODS, ROCK_SHAPES } from '../../app/game/graphics/orbit-rocks.client';
import { buildOrbitPath, orbitClearance, orbitLod } from '../../app/game/graphics/orbit-world.client';
import { parseRecords, recordRun } from '../../app/game/runtime/records.client';

const path = buildOrbitPath();
const clearance = orbitClearance(path);
const cells = [-2, -1, 0, 1, 2].flatMap(x => [-1, 0, 1].flatMap(y =>
  Array.from({ length: 18 }, (_, i) => [x, y, -1 - i] as const)));

test('cell identities survive generation order, and density adds clusters around the same anchor rocks', () => {
  const make = (seed: number, dense = true) => new OrbitField(seed, dense ? 'dense' : 'sparse', clearance);
  const dense = make(orbitPreview.seed);
  const sparse = make(orbitPreview.seed, false);
  const different = make(90210);
  const forward = cells.flatMap(cell => dense.cell(...cell));
  const backward = [...cells].reverse().flatMap(cell => dense.cell(...cell));
  const anchors = cells.flatMap(cell => sparse.cell(...cell));
  const byId = new Map(forward.map(rock => [rock.id, rock]));
  expect(byId.size).toBe(forward.length);
  expect([...forward].sort(compareId)).toEqual(backward.sort(compareId));
  expect(forward.length).toBeGreaterThan(anchors.length * 1.6);
  expect(anchors.every(rock => JSON.stringify(rock) === JSON.stringify(byId.get(rock.id)))).toBe(true);
  expect(cells.flatMap(cell => different.cell(...cell))).not.toEqual(forward);
  expect(new Set(forward.map(rock => rock.shape)).size).toBe(ROCK_SHAPES);
  expect(Math.max(...forward.map(rock => rock.radius))).toBeLessThan(ORBIT_MAX_RADIUS);
  for (const rock of forward) {
    const owner = rock.cell.split(',').map(Number);
    expect(rock.position.every((n, axis) => n - rock.radius >= owner[axis] * ORBIT_CELL &&
      n + rock.radius <= (owner[axis] + 1) * ORBIT_CELL)).toBe(true);
  }
});

function compareId(a: { id: string }, b: { id: string }) { return a.id.localeCompare(b.id); }

test('every LOD fits the declared sphere and the dense field clears both the swept hull and view chords', () => {
  const point = new Vector3();
  for (let shape = 0; shape < ROCK_SHAPES; shape++) for (let lod = 0; lod < ROCK_LODS; lod++) {
    const geometry = orbitRockGeometry(shape, lod);
    const position = geometry.getAttribute('position');
    expect(Math.max(...Array.from({ length: position.count }, (_, i) => point.fromBufferAttribute(position, i).length()))).toBeLessThan(1);
    geometry.dispose();
  }
  const samples = Array.from({ length: ORBIT_LENGTH / 2 + 1 }, (_, i) => path.sample(i * 2).p);
  for (const seed of [orbitPreview.seed, 1, 4294967295]) {
    const field = new OrbitField(seed, 'dense', clearance);
    for (const cell of cells) for (const rock of field.cell(...cell)) {
      point.fromArray(rock.position);
      for (let i = 0; i < samples.length; i++) {
        const start = samples[i];
        if (Math.abs(start.z - point.z) > 110 + rock.radius) continue;
        if (point.distanceToSquared(start) < (ORBIT_CLEARANCE + rock.radius) ** 2) throw new Error(`Hull intrusion at ${rock.id}`);
        if (i + 52 < samples.length && i % 4 === 0) {
          const end = samples[i + 52];
          const chord = segment.copy(end).sub(start);
          const t = Math.max(0, Math.min(1, projected.copy(point).sub(start).dot(chord) / chord.lengthSq()));
          if (point.distanceToSquared(projected.copy(start).addScaledVector(chord, t)) < (ORBIT_CLEARANCE + 5 + rock.radius) ** 2 - 1e-6) {
            throw new Error(`View intrusion at ${rock.id}`);
          }
        }
      }
    }
  }
});

const segment = new Vector3();
const projected = new Vector3();

test('projected size changes LOD with a separate exit threshold on each quality tier', () => {
  for (const quality of ['low', 'auto', 'high'] as const) {
    expect(orbitLod(120, 2, quality)).toBe(0);
    expect(orbitLod(30, 2, quality)).toBe(1);
    expect(orbitLod(5, 0, quality)).toBe(2);
  }
  expect(orbitLod(45, 1, 'auto')).toBe(1);
  expect(orbitLod(45, 0, 'auto')).toBe(0);
});

test('saving a playable volume retains retired ORBIT Standard and Sightseeing records', () => {
  const standard = { normal: { best: 30, last: { score: 25, outcome: 'ESCAPED' } } };
  const sightseeing = { last: { score: 11, outcome: 'ESCAPED' } };
  const records = parseRecords(JSON.stringify({ version: 1, standard: { orbit: standard }, sightseeing: { orbit: sightseeing } }));
  recordRun(records, 'daybreak', 'normal', 'standard', { score: 80, outcome: 'ESCAPED' });
  const saved = parseRecords(JSON.stringify(records));
  expect(saved.standard.orbit).toEqual(standard);
  expect(saved.sightseeing.orbit).toEqual(sightseeing);
});
