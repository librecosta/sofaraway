import * as THREE from 'three';
import type { BranchLayout } from '../core/branches';
import type { facilityZones } from '../core/descent-facility';
import { controlFixtureCue } from '../core/rhythmic-lights';
import type { ControlFixtureCue, DynamicLightEnvelope } from '../core/rhythmic-lights';
import { buildFacilityArchitecture, securityTint } from './descent-architecture';
import { DescentJunction } from './descent-junction';
import { facilityLampMaterial, facilityStructureMaterial } from './descent-materials.client';
import type { BranchPath } from './branch-path';
import type { Path } from './path';

type Zone = ReturnType<typeof facilityZones>[number];
const interior = new THREE.Color(0x10151d);
const air = new THREE.Color(0x151e29);
const wellAir = new THREE.Color(0x28394c);
const wellBackdrop = new THREE.Color(0x172333);
const coreAir = new THREE.Color(0x232634);
const coreBackdrop = new THREE.Color(0x151924);
const breachAir = new THREE.Color(0x546a78);
const breachBackdrop = new THREE.Color(0x758791);
const endTint = new THREE.Color();

function roomWeight(station: number, zone: Zone | undefined, edge: number) {
  return zone ? THREE.MathUtils.smoothstep(station, zone.start - edge, zone.start + edge) *
    (1 - THREE.MathUtils.smoothstep(station, zone.end - edge, zone.end + edge)) : 0;
}

export class DescentFacility {
  private readonly fill = new THREE.Color();
  private readonly railBounce = new THREE.Color();
  private readonly signalTarget = new THREE.Color();
  private readonly cue: ControlFixtureCue = { marker: 0, flow: 0, alarm: 0, stator: 1, phase: 0 };
  private readonly lampGains = new THREE.Vector4(.42, 0, 0, 1);
  private readonly lampPhase = { value: 0 };
  private readonly shell = facilityStructureMaterial(this.fill, this.railBounce);
  private readonly fixtures = facilityLampMaterial(this.lampGains, this.lampPhase, 0xbac1c7);
  private readonly security = facilityLampMaterial(this.lampGains, this.lampPhase);
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

  light(station: number, beat: number, dynamics: Readonly<DynamicLightEnvelope>, fog: THREE.Color, background: THREE.Color) {
    const well = roomWeight(station, this.well, 43);
    const core = roomWeight(station, this.core, 43);
    const exit = this.zones[this.zones.length - 1];
    const outside = exit.name === 'BREACH' ?
      THREE.MathUtils.smoothstep(station, exit.start + (exit.finish - exit.start) * .24, exit.finish) : 0;
    fog.copy(air).lerp(wellAir, well).lerp(coreAir, core).lerp(breachAir, outside);
    background.copy(interior).lerp(wellBackdrop, well).lerp(coreBackdrop, core).lerp(breachBackdrop, outside);
    this.fill.setRGB(.081 - .024 * well + .016 * core + .095 * outside,
      .094 - .019 * well + .018 * core + .108 * outside,
      .112 - .013 * well + .024 * core + .121 * outside);
    const cue = this.cue;
    controlFixtureCue(beat, dynamics, cue);
    this.lampGains.set(cue.marker, cue.flow, cue.alarm, cue.stator);
    this.lampPhase.value = cue.phase;
    const index = this.zones.findIndex(zone => station < zone.end);
    securityTint(this.zones[index] ?? exit, this.zones[index + 1], station, this.railBounce, this.signalTarget);
    this.railBounce.multiplyScalar(.005 + cue.marker * .018);
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

  junction(path: BranchPath, layout: BranchLayout) {
    return new DescentJunction(path, layout, this.shell, this.security);
  }

  dispose() {
    this.shell.dispose();
    this.fixtures.dispose();
    this.security.dispose();
  }
}
