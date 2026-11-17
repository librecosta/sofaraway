import * as THREE from 'three';
import type { facilityZones } from '../core/descent-facility';
import { buildFacilityArchitecture, securityTint } from './descent-architecture';
import { facilityStructureMaterial } from './descent-materials.client';
import type { Path } from './path';

type Zone = ReturnType<typeof facilityZones>[number];
const interior = new THREE.Color(0x111720);
const air = new THREE.Color(0x202b37);
const wellAir = new THREE.Color(0x35485d);
const wellBackdrop = new THREE.Color(0x1d2939);
const coreAir = new THREE.Color(0x2b2e3c);
const coreBackdrop = new THREE.Color(0x171c27);
const breachAir = new THREE.Color(0x607481);
const breachBackdrop = new THREE.Color(0x798c97);
const endTint = new THREE.Color();

function roomWeight(station: number, zone: Zone | undefined, edge: number) {
  return zone ? THREE.MathUtils.smoothstep(station, zone.start - edge, zone.start + edge) *
    (1 - THREE.MathUtils.smoothstep(station, zone.end - edge, zone.end + edge)) : 0;
}

export class DescentFacility {
  private readonly fill = new THREE.Color();
  private readonly railBounce = new THREE.Color();
  private readonly signalTarget = new THREE.Color();
  private readonly shell = facilityStructureMaterial(this.fill, this.railBounce);
  private readonly fixtures = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, color: 0xc9c9c9, toneMapped: false,
  });
  private readonly security = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, toneMapped: false,
  });
  private readonly well: Zone | undefined;
  private readonly core: Zone | undefined;

  constructor(private readonly path: Path, private readonly zones: readonly Zone[]) {
    this.well = zones.find(zone => zone.name === 'THE WELL');
    this.core = zones.find(zone => zone.name === 'CORE');
  }

  zoneAt(station: number) { return this.zones.find(zone => station < zone.end) ?? this.zones[this.zones.length - 1]; }

  gateTint(station: number, out: THREE.Color) {
    const { glass: [first, last], start, finish } = this.zoneAt(station);
    return out.setHex(first).lerp(endTint.setHex(last), THREE.MathUtils.smoothstep(station, start, finish));
  }

  light(station: number, fixtureGain: number, fog: THREE.Color, background: THREE.Color) {
    const well = roomWeight(station, this.well, 43);
    const core = roomWeight(station, this.core, 43);
    const exit = this.zones[this.zones.length - 1];
    const outside = exit.name === 'BREACH' ?
      THREE.MathUtils.smoothstep(station, exit.start + (exit.finish - exit.start) * .40, exit.finish) : 0;
    fog.copy(air).lerp(wellAir, well).lerp(coreAir, core).lerp(breachAir, outside);
    background.copy(interior).lerp(wellBackdrop, well).lerp(coreBackdrop, core).lerp(breachBackdrop, outside);
    this.fill.setRGB(.145 + .021 * well + .035 * core + .039 * outside,
      .154 + .060 * well + .034 * core + .052 * outside,
      .171 + .087 * well + .045 * core + .062 * outside);
    const rhythm = THREE.MathUtils.clamp(fixtureGain - 1, -1, 1);
    this.security.color.setScalar(.72 + .074 * rhythm);
    const index = this.zones.findIndex(zone => station < zone.end);
    securityTint(this.zones[index] ?? exit, this.zones[index + 1], station, this.railBounce, this.signalTarget);
    this.railBounce.multiplyScalar(.020 + .011 * rhythm);
    return .0055 - .00118 * well - .00052 * core - .0010 * outside;
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
