import { createHash } from 'node:crypto';
import { Float16BufferAttribute, InstancedBufferAttribute, InstancedMesh, Mesh } from 'three';
import { expect, test } from 'vitest';
import type { Difficulty, PlayMode } from '../../app/game/contracts';
import { branchLayout } from '../../app/game/core/branches';
import { facilityZones } from '../../app/game/core/descent-facility';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { DescentFacility } from '../../app/game/graphics/descent-facility.client';

function geometricDigest(meshes: readonly Mesh[]) {
  const hash = createHash('sha256');
  const describe = (value: unknown) => hash.update(JSON.stringify(value) + '\n');
  for (const mesh of meshes) {
    const { geometry } = mesh;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const box = geometry.boundingBox;
    const sphere = geometry.boundingSphere!;
    describe([mesh.name, mesh.type, geometry.type, geometry.groups,
      box?.min.toArray(), box?.max.toArray(), sphere.center.toArray(), Math.fround(sphere.radius)]);
    const attributes = { ...geometry.attributes, index: geometry.index,
      ...(mesh instanceof InstancedMesh ? { instanceMatrix: mesh.instanceMatrix } : {}) };
    if (mesh instanceof InstancedMesh) {
      mesh.computeBoundingSphere();
      describe([mesh.count, mesh.boundingSphere!.center.toArray(), Math.fround(mesh.boundingSphere!.radius)]);
    }
    for (const [name, attribute] of Object.entries(attributes).sort(([a], [b]) => a < b ? -1 : 1)) {
      if (!attribute) continue;
      if (name === 'industrialSurface' || name === 'industrialSpill' || (name === 'uv' && !(mesh instanceof InstancedMesh))) {
        expect(attribute).toBeInstanceOf(Float16BufferAttribute);
      }
      if (name === 'lightSpan' || name === 'lightCue' || name === 'instanceMatrix') {
        expect(attribute).toBeInstanceOf(InstancedBufferAttribute);
        expect((attribute as InstancedBufferAttribute).meshPerAttribute).toBe(1);
      }
      const { array } = attribute;
      describe([name, array.constructor.name, attribute.itemSize, attribute.count, attribute.normalized]);
      hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    }
  }
  return hash.digest('hex');
}

// Captured from 5602202 before changing construction.
const expected = {
  'standard impossible': {
    ORDER: 'ab8505ec086deea91d8393d2c253e2a6bf03b2f5999f586ff7fa4c3fcb355bd6',
    LOCK: '3a1bff290e36b35d80525565dbff65434b2e06e9367484398cb19fd73fab2e7d',
    FLIGHT: '7959d1eb8f77019bec3976e1806fab143396d68ee1509ea28dc378a3bda0b094',
    PRESSURE: 'b71c5441430519446dfbdc9416e9b192d19808f38a6c716d56cde65e3cc323af',
    HOLD: 'cad288de463ddda00da8bf544653aea74f52161db56831f3aa85849d2b978ccb',
    LOCKDOWN: '4432717719414e81093e600d243b0b295dc6aadf458860aded93bb7b1709c848',
    BREACH: '96c40337e3c3c360110e2f79a8e3fe7366f11ef67edece6c6537058912da76e9',
    Encore: '5e1497e2f8d5b67a3ae9f20a4f2bc11731bfe4c96cc9c09395caa60d97f98da3',
    'Afterglow boundary': 'f0349e3d250069c39ca82b13670d98b32a2ff9b4c645f6d2645855f28502b08f',
    Transfer: '62d6ebaba7b4a255e8525063f671b907cd5e039a9fa1c63fa9945e9363403326',
  },
  'standard normal': {
    PRESSURE: 'd5dd0c7985c70e74a93b142c9e40fa4723f683c0ea0d5567c576ff59980c090a',
    Encore: 'fa4ef6e21d4f60e956d0f500dbc3a9bbc50bc5b27f7442c59a55530cca7148d6',
    'Afterglow boundary': '811571b37447a4bd1d2fa66b0f9ecb1a8611c3587fbda6a632ac3b135bf01928',
    Transfer: '10cd3c69bcf97356b16657174e036c166a1f2fb9a13039524788b8f12f0b9585',
  },
  'sightseeing normal': {
    PRESSURE: 'a940d407effcd8983db0887e7c9572b8452d4e1ed11d1f4c8b048c8567bcbe9c',
    Transfer: '086be841b24108bb6a8c4c281f8773dbb80572798dd1e30f655c7bd9915147e3',
  },
};

for (const [mode, difficulty, seed, fixture] of [
  ['standard', 'impossible', 0, 'standard impossible'],
  ['standard', 'normal', 1, 'standard normal'],
  ['sightseeing', 'normal', 1, 'sightseeing normal'],
] as const satisfies readonly [PlayMode, Difficulty, number, keyof typeof expected][]) {
  test(`DESCENT facility geometry retains the frozen ${mode} ${difficulty} attributes`, () => {
    const definition = volumeById('descent');
    const sim = new Simulation(definition, {}, undefined, mode, difficulty);
    sim.start(difficulty, seed, undefined, mode);
    const zones = facilityZones(definition, mode, sim.reference);
    const facility = new DescentFacility(sim.path, zones);
    const fixtures: Record<string, string> = {};
    const sample = (name: string, from: number, to: number) => {
      const meshes = facility.build(from, to);
      fixtures[name] = geometricDigest(meshes);
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        if (mesh instanceof InstancedMesh) mesh.dispose();
      }
    };
    try {
      for (const zone of zones) {
        if (difficulty !== 'impossible' && zone.section !== 'PRESSURE') continue;
        const midpoint = (zone.start + zone.finish) / 2;
        const from = Math.floor(midpoint / 210) * 210;
        sample(zone.section, from, from + 210);
      }
      if (sim.outroPlan) {
        const { gates, afterglowStart } = sim.outroPlan;
        const first = gates[0]?.worldStation;
        facility.setOutro(sim.outroPlan);
        if (first !== undefined) sample('Encore', first - 44, first + 166);
        if (mode === 'standard') sample('Afterglow boundary', afterglowStart - 52, afterglowStart + 158);
      }
      const transfer = facility.junction(sim.junctionPath!, branchLayout(seed));
      try {
        const meshes: Mesh[] = [];
        transfer.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
        fixtures.Transfer = geometricDigest(meshes);
      } finally { transfer.dispose(); }
    } finally { facility.dispose(); }
    expect(fixtures).toEqual(expected[fixture]);
  });
}
