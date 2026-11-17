import * as THREE from 'three';
import type { facilityZones } from '../core/descent-facility';
import { buildFacilityArchitecture } from './descent-architecture';
import { IndustrialGeometry } from './industrial-geometry';
import type { Path } from './path';

type Zone = ReturnType<typeof facilityZones>[number];
const perimeterLight = new THREE.Color(0xaec3cf);
const interior = new THREE.Color(0x111720);
const fogColor = new THREE.Color();
const endTint = new THREE.Color();

export class DescentFacility {
  private readonly shell = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide,
    color: 0xe4ebee, metalness: .34, roughness: .68, emissive: 0x687982, emissiveIntensity: .18 });
  private readonly fixtures = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, color: 0xc9c9c9, toneMapped: false,
  });
  private readonly security = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, toneMapped: false,
  });

  constructor(private readonly path: Path, private readonly zones: readonly Zone[]) {}

  zoneAt(station: number) { return this.zones.find(zone => station < zone.end) ?? this.zones[this.zones.length - 1]; }

  laserTint(station: number, out: THREE.Color) {
    const { laser: [first, last], start, finish } = this.zoneAt(station);
    return out.setHex(first).lerp(endTint.setHex(last), THREE.MathUtils.smoothstep(station, start, finish));
  }

  light(station: number, fixtureGain: number, fog: THREE.Color, background: THREE.Color) {
    const zone = this.zoneAt(station);
    const upcoming = this.zoneAt(station + 36);
    const blend = THREE.MathUtils.smoothstep(station, zone.end - 36, zone.end);
    fog.setHex(zone.armor);
    if (upcoming !== zone) fog.lerp(fogColor.setHex(upcoming.armor), blend);
    fog.multiplyScalar(.13);
    const exit = this.zones[this.zones.length - 1];
    const exitLength = exit.finish - exit.start;
    const outside = THREE.MathUtils.smoothstep(station, exit.start + exitLength * .40, exit.start + exitLength * .92);
    background.copy(interior).lerp(perimeterLight, outside * .30);
    fog.lerp(background, outside * .52);
    this.security.color.setScalar(.49 + .28 * fixtureGain);
  }

  build(from: number, to: number) {
    const metal = new IndustrialGeometry();
    const workLights = new IndustrialGeometry();
    const securityLights = new IndustrialGeometry();
    buildFacilityArchitecture(this.path, this.zones, from, to, metal, workLights, securityLights);
    const structure = new THREE.Mesh(metal.build(), this.shell);
    const fixtures = new THREE.Mesh(workLights.build(), this.fixtures);
    const security = new THREE.Mesh(securityLights.build(), this.security);
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
