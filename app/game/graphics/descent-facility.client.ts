import * as THREE from 'three';
import type { BranchLayout } from '../core/branches';
import type { facilityZones } from '../core/descent-facility';
import { ControlLamp, controlLampCount, controlLightingAt, controlLightPhrases, neutralLampGains, newControlLighting }
  from '../core/descent-lighting';
import type { ControlLightView } from '../core/descent-lighting';
import type { DynamicLightEnvelope } from '../core/rhythmic-lights';
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
const fixtureBase = new THREE.Vector3(.77, .88, 1);
const palettes = controlLightPhrases.map(phrase => ({
  groups: phrase.colors.map(swatch => new THREE.Color(swatch)), rim: new THREE.Color(phrase.rim),
}));
const focusGroup: Record<ControlLightView, number> = {
  all: -1, glass: -2, roof: ControlLamp.Roof, floor: ControlLamp.Floor, left: ControlLamp.Left, right: ControlLamp.Right,
};

function roomWeight(station: number, zone: Zone | undefined, edge: number) {
  return zone ? THREE.MathUtils.smoothstep(station, zone.start - edge, zone.start + edge) *
    (1 - THREE.MathUtils.smoothstep(station, zone.end - edge, zone.end + edge)) : 0;
}

export class DescentFacility {
  private readonly fill = new THREE.Color();
  private readonly railBounce = new THREE.Color();
  private readonly signalTarget = new THREE.Color();
  private readonly cue = newControlLighting();
  private readonly score = {
    groups: Array.from({ length: controlLampCount }, (_, i) => new THREE.Vector4(1, 1, 1, neutralLampGains[i])),
    spill: Array.from({ length: controlLampCount }, () => fixtureBase.clone()),
    motion: new THREE.Vector4(0, 0, 0, 0),
    focus: { value: -1 },
  };
  private readonly tint = new THREE.Color();
  readonly gateRim = new THREE.Vector4(1, 1, 1, 0);
  private readonly shell = facilityStructureMaterial(this.fill, this.railBounce, this.score);
  private readonly fixtures = facilityLampMaterial(this.score, 0xbac1c7);
  private readonly security = facilityLampMaterial(this.score);
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

  light(station: number, beat: number, dynamics: Readonly<DynamicLightEnvelope>, fog: THREE.Color, background: THREE.Color,
    view: ControlLightView = 'all') {
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
    const { cue, score, tint } = this;
    controlLightingAt(beat, dynamics.amount, cue);
    const from = palettes[cue.previous], to = palettes[cue.phrase], blend = cue.blend;
    const focus = score.focus.value = focusGroup[view];
    score.motion.set(cue.amount, cue.travel, cue.relay, beat);
    for (let i = 0; i < score.groups.length; i++) {
      tint.copy(from.groups[i]).lerp(to.groups[i], blend);
      const active = focus === -1 || focus === i;
      const gain = active ? cue.gains[i] : neutralLampGains[i];
      score.groups[i].set(tint.r, tint.g, tint.b, gain);
      const spill = score.spill[i].copy(fixtureBase);
      const weight = active ? .38 * cue.amount : 0;
      if (weight) {
        tint.multiplyScalar(1.2 + .3 * gain);
        spill.set(tint.r, tint.g, tint.b).lerp(fixtureBase, 1 - weight);
      }
    }
    tint.copy(from.rim).lerp(to.rim, blend);
    this.gateRim.set(tint.r, tint.g, tint.b, view === 'all' || view === 'glass' ? cue.rim : 0);
    const index = this.zones.findIndex(zone => station < zone.end);
    securityTint(this.zones[index] ?? exit, this.zones[index + 1], station, this.railBounce, this.signalTarget);
    const rail = score.groups[ControlLamp.Rail];
    this.railBounce.lerp(tint.setRGB(rail.x, rail.y, rail.z), focus === -1 ? cue.amount * .42 : 0)
      .multiplyScalar(.005 + rail.w * .018);
    return .0055 - .00118 * well - .00052 * core - .0010 * outside;
  }

  get lighting() {
    const { beat, phrase, amount, travel, relay } = this.cue;
    return { beat, phrase, amount, travel, relay, rim: this.gateRim.w };
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
