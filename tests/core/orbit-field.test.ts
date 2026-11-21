import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { ORBIT_CELL, ORBIT_CLEARANCE, ORBIT_MAX_RADIUS, ORBIT_WORLD_SEED, OrbitField } from '../../app/game/core/orbit-field';
import { routeSides } from '../../app/game/core/branches';
import { START_DISTANCE } from '../../app/game/core/reference-track';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { orbitRockGeometry, ROCK_LODS, ROCK_SHAPES } from '../../app/game/graphics/orbit-rocks.client';
import { orbitClearance, orbitCourseBelt, orbitLod } from '../../app/game/graphics/orbit-world.client';
import { parseRecords, recordFor, recordRun } from '../../app/game/runtime/records.client';

const sim = new Simulation(volumeById('orbit'));
sim.start('normal');
const path = sim.path;
const clearance = orbitClearance(path, sim.junctionPath);
const belt = orbitCourseBelt(path, 'standard');
const firstZ = Math.floor(path.sample(START_DISTANCE).p.z / ORBIT_CELL);
const cells = [-2, -1, 0, 1, 2].flatMap(x => [-1, 0, 1].flatMap(y =>
  Array.from({ length: 18 }, (_, i) => [x, y, firstZ - i] as const)));

test('cell identities survive generation order, and density adds clusters around the same anchor rocks', () => {
  const make = (seed: number, dense = true) => new OrbitField(seed, dense ? 'dense' : 'sparse', clearance, belt);
  const dense = make(ORBIT_WORLD_SEED);
  const sparse = make(ORBIT_WORLD_SEED, false);
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
  for (const [mode, difficulty] of [['standard', 'normal'], ['standard', 'impossible'], ['sightseeing', 'normal']] as const) {
    const run = new Simulation(volumeById('orbit'));
    run.start(difficulty, 1, 'lumen', mode);
    const branch = run.junctionPath!;
    const reach = mode === 'standard' ? 200 : 200 / 3;
    const safety = orbitClearance(run.path, branch, mode);
    const field = new OrbitField(ORBIT_WORLD_SEED, 'dense', safety, orbitCourseBelt(run.path, mode));
    const startCell = Math.floor(run.path.sample(branch.guideStart - reach).p.z / ORBIT_CELL);
    const endCell = Math.floor(run.path.sample(branch.end + reach).p.z / ORBIT_CELL);
    const samples = routeSides.flatMap(side => Array.from({ length: Math.ceil((branch.end - branch.guideStart + reach * 2) / 2) },
      (_, i) => branch.sample(branch.guideStart - reach + i * 2, side).p));
    const nearby = [-2, -1, 0, 1, 2].flatMap(x => [-1, 0, 1].flatMap(y =>
      Array.from({ length: startCell - endCell + 1 }, (_, i) => [x, y, startCell - i] as const)));
    const gateViews = routeSides.flatMap(side => {
      const route = run.branch!.layout[side];
      return run.branchGates![route].flatMap(gate => [reach * .45, reach * .95].map(ahead => {
        const start = branch.sample(gate.worldStation - ahead, side).p;
        return { start, chord: branch.sample(gate.worldStation, side).p.sub(start) };
      }));
    });
    for (const cell of nearby) for (const rock of field.cell(...cell)) {
      point.fromArray(rock.position);
      for (const sample of samples) {
        if (point.distanceToSquared(sample) < (ORBIT_CLEARANCE + rock.radius) ** 2) throw new Error(`Hull intrusion at ${rock.id}`);
      }
      for (const { start, chord } of gateViews) {
        const t = Math.max(0, Math.min(1, projected.copy(point).sub(start).dot(chord) / chord.lengthSq()));
        if (point.distanceToSquared(projected.copy(start).addScaledVector(chord, t)) < (ORBIT_CLEARANCE + rock.radius) ** 2) {
          throw new Error(`Gate view intrusion at ${rock.id}`);
        }
      }
    }
  }
});

const projected = new Vector3();

test('the full orbit course cycles through dense, sparse and open belts', () => {
  const at = (beat: number) => belt(Math.floor(path.sample(sim.reference.station(beat, 'standard')).p.z / ORBIT_CELL));
  expect(at(212).density).toBeGreaterThan(at(10).density + .6);
  expect(at(247).coverage).toBeLessThan(at(212).coverage * .5);
  expect(at(295).drift).toBeGreaterThan(at(377).drift + 1);
  expect(belt(Math.floor(path.sample(path.length).p.z / ORBIT_CELL)).density).toBeLessThan(.1);
});

test('projected size changes LOD with a separate exit threshold on each quality tier', () => {
  for (const quality of ['low', 'auto', 'high'] as const) {
    expect(orbitLod(120, 2, quality)).toBe(0);
    expect(orbitLod(12, 2, quality)).toBe(1);
    expect(orbitLod(2, 0, quality)).toBe(2);
  }
  expect(orbitLod(19, 1, 'auto')).toBe(1);
  expect(orbitLod(19, 0, 'auto')).toBe(0);
  for(const quality of ['low','auto','high'] as const)for(const radius of [6,15,42])
    for(const pixels of [1,5,30,130,550,1800])expect(orbitLod(pixels,2,quality,radius)).toBe(quality==='low'?1:0);
});

test('saving a playable volume retains retired ORBIT Standard and Sightseeing records', () => {
  const standard = { normal: { best: 30, last: { score: 25, outcome: 'ESCAPED' } } };
  const sightseeing = { last: { score: 11, outcome: 'ESCAPED' } };
  const playable = { ...standard, impossible: { best: 900, last: { score: 900, outcome: 'ESCAPED' } } };
  const records = parseRecords(JSON.stringify({ version: 1, standard: { orbit: standard, 'orbit-astral-playable-v1': playable },
    sightseeing: { orbit: sightseeing, 'orbit-astral-playable-v1': sightseeing } }));
  expect(recordFor(records, 'orbit', 'normal', 'standard')).toEqual({ best: null, last: null });
  recordRun(records, 'orbit', 'impossible', 'standard', { score: 80, encoreBonus: 20, outcome: 'ESCAPED' });
  recordRun(records, 'orbit', 'normal', 'sightseeing', { score: 120, outcome: 'ESCAPED' });
  const saved = parseRecords(JSON.stringify(records));
  expect(saved.standard.orbit).toEqual(standard);
  expect(saved.standard['orbit-astral-playable-v1']).toEqual(playable);
  expect(saved.sightseeing['orbit-astral-playable-v1']).toEqual(sightseeing);
  expect(saved.sightseeing.orbit).toEqual(sightseeing);
  expect(recordFor(saved, 'orbit', 'impossible', 'standard').best).toBe(100);
  expect(recordFor(saved, 'orbit', 'normal', 'sightseeing')).toMatchObject({ best: null, last: { score: 120 } });
});
