import * as THREE from 'three';
import type { facilityZones } from '../core/descent-facility';
import { buildFacilityArchitecture } from './descent-architecture';
import { facilityStructureMaterial } from './descent-materials.client';
import type { Path } from './path';

type Zone = ReturnType<typeof facilityZones>[number];
const perimeterLight = new THREE.Color(0xaec3cf);
const interior = new THREE.Color(0x111720);
const air = new THREE.Color(0x2d3d53);
const distantSteel = new THREE.Color(0x52647e);
const endTint = new THREE.Color();

export class DescentFacility {
  private readonly shell = facilityStructureMaterial();
  private readonly fixtures = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, color: 0xc9c9c9, toneMapped: false,
  });
  private readonly security = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, toneMapped: false,
  });

  constructor(private readonly path: Path, private readonly zones: readonly Zone[]) {}

  zoneAt(station: number) { return this.zones.find(zone => station < zone.end) ?? this.zones[this.zones.length - 1]; }

  gateTint(station: number, out: THREE.Color) {
    const { glass: [first, last], start, finish } = this.zoneAt(station);
    return out.setHex(first).lerp(endTint.setHex(last), THREE.MathUtils.smoothstep(station, start, finish));
  }

  light(station: number, fixtureGain: number, fog: THREE.Color, background: THREE.Color) {
    const well = this.zones.find(zone => zone.name === 'THE WELL');
    const depth = well ? THREE.MathUtils.smoothstep(station, well.start - 24, well.start + 28) *
      (1 - THREE.MathUtils.smoothstep(station, well.end - 24, well.end + 28)) : 0;
    fog.copy(air).lerp(distantSteel, depth * .34).multiplyScalar(.44);
    const exit = this.zones[this.zones.length - 1];
    const exitLength = exit.finish - exit.start;
    const outside = THREE.MathUtils.smoothstep(station, exit.start + exitLength * .40, exit.start + exitLength * .92);
    background.copy(interior).lerp(perimeterLight, outside * .30);
    fog.lerp(background, outside * .52);
    this.security.color.setScalar(.73 + .09 * THREE.MathUtils.clamp(fixtureGain - 1, -1, 1));
  }

  build(from: number, to: number) {
    const geometry = buildFacilityArchitecture(this.path, this.zones, from, to);
    const structure = new THREE.Mesh(geometry.structure, this.shell);
    const fixtures = new THREE.Mesh(geometry.fixtures, this.fixtures);
    const security = new THREE.Mesh(geometry.security, this.security);
    structure.name = 'facility-structure';
    fixtures.name = 'facility-fixtures';
    security.name = 'facility-security';
    return [structure, fixtures, security];
  }

  dispose() {
    this.shell.dispose();
    this.fixtures.dispose();
    this.security.dispose();
  }
}
