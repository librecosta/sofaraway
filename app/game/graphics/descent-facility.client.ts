import * as THREE from 'three';
import type { BranchLayout } from '../core/branches';
import type { facilityZones } from '../core/descent-facility';
import { ControlLamp, controlLampCount, controlLightingAt, controlLightPhrases, controlSetpieceAt, neutralLampGains, newControlLighting }
  from '../core/descent-lighting';
import type { ControlLightView } from '../core/descent-lighting';
import type { DynamicLightEnvelope } from '../core/rhythmic-lights';
import { buildFacilityArchitecture, securityTint } from './descent-architecture';
import { DescentJunction } from './descent-junction';
import { facilityInstallationMaterial, facilityLampMaterial, facilityStructureMaterial } from './descent-materials.client';
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
  pane: new THREE.Color(phrase.pane),
}));
const focusGroup: Record<ControlLightView, number> = {
  all: -1, glass: -2, roof: ControlLamp.Roof, floor: ControlLamp.Floor, left: ControlLamp.Left, right: ControlLamp.Right,
};
const complement = [ControlLamp.Floor, ControlLamp.Roof, ControlLamp.Right, ControlLamp.Left,
  ControlLamp.Deck, ControlLamp.DeepDeck, ControlLamp.Deck, ControlLamp.Roof, ControlLamp.Floor, ControlLamp.Route];

function roomWeight(station: number, zone: Zone | undefined, edge: number) {
  return zone ? THREE.MathUtils.smoothstep(station, zone.start - edge, zone.start + edge) *
    (1 - THREE.MathUtils.smoothstep(station, zone.end - edge, zone.end + edge)) : 0;
}

export class DescentFacility {
  private readonly fill = new THREE.Color();
  private readonly railBounce = new THREE.Color();
  private readonly signalTarget = new THREE.Color();
  private readonly cue = newControlLighting();
  private readonly lockdown: Zone;
  private readonly score = {
    groups: Array.from({ length: controlLampCount }, (_, i) => new THREE.Vector4(1, 1, 1, neutralLampGains[i])),
    accents: Array.from({ length: controlLampCount }, () => new THREE.Vector3(1, 1, 1)),
    spill: Array.from({ length: controlLampCount }, () => fixtureBase.clone()),
    motion: new THREE.Vector4(0, 0, 0, 0),
    events: new THREE.Vector4(0, 0, 0, 0),
    energy: { value: 0 },
    focus: { value: -1 },
    spatial: new THREE.Vector4(),
    security: new THREE.Vector2(),
    transfer: new THREE.Vector3(),
  };
  private readonly tint = new THREE.Color();
  private readonly accent = new THREE.Color();
  private readonly gateFace = new THREE.Color();
  readonly gateRim = new THREE.Vector4(1, 1, 1, 0);
  private readonly shell = facilityStructureMaterial(this.fill, this.railBounce, this.score);
  private readonly fixtures = facilityLampMaterial(this.score);
  private readonly security = facilityLampMaterial(this.score);
  private readonly installation = facilityInstallationMaterial(this.score);
  private readonly well: Zone | undefined;
  private readonly core: Zone | undefined;

  constructor(private readonly path: Path, private readonly zones: readonly Zone[]) {
    this.well = zones.find(zone => zone.name === 'THE WELL');
    this.core = zones.find(zone => zone.name === 'CORE');
    this.lockdown = zones.find(zone => zone.name === 'LOCKDOWN') ?? zones[0];
  }

  zoneAt(station: number) { return this.zones.find(zone => station < zone.end) ?? this.zones[this.zones.length - 1]; }

  gateTint(station: number, out: THREE.Color) {
    const { glass: [first, last], start, finish } = this.zoneAt(station);
    out.setHex(first).lerp(endTint.setHex(last), THREE.MathUtils.smoothstep(station, start, finish));
    if (this.score.focus.value < 0) out.lerp(this.gateFace, .86);
    return out;
  }

  light(station: number, beat: number, dynamics: Readonly<DynamicLightEnvelope>, fog: THREE.Color, background: THREE.Color,
    view: ControlLightView = 'all', reducedMotion = false) {
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
    const { cue, score, tint, accent } = this;
    controlLightingAt(beat, dynamics.amount, cue, reducedMotion);
    const setpiece = controlSetpieceAt(beat, dynamics.amount, reducedMotion);
    this.score.spatial.set(station, setpiece.motion, setpiece.shaft, setpiece.precharge);
    const armed = THREE.MathUtils.smoothstep(station, this.lockdown.start - 12,
      THREE.MathUtils.lerp(this.lockdown.start, this.lockdown.finish, .56));
    const exitProgress = THREE.MathUtils.smoothstep(station, exit.start, exit.finish);
    this.score.security.set(Math.max(armed, setpiece.lockdown), Math.max(exitProgress, setpiece.release));
    const from = palettes[cue.previous], to = palettes[cue.phrase], blend = cue.blend;
    const focus = score.focus.value = focusGroup[view];
    this.installation.visible = view !== 'glass';
    score.motion.set(cue.amount, cue.travel, cue.relay, beat);
    score.energy.value = cue.energy;
    const [kick, snare, signal, chord, , sweep] = cue.accents;
    score.events.set(kick, snare, signal, sweep);
    const migration = chord * cue.energy * .46;
    for (let i = 0; i < score.groups.length; i++) {
      tint.copy(from.groups[i]).lerp(to.groups[i], blend);
      const pair = complement[i];
      accent.copy(from.groups[pair]).lerp(to.groups[pair], blend);
      score.accents[i].set(accent.r, accent.g, accent.b);
      tint.lerp(accent, migration);
      const active = focus === -1 || focus === i;
      const gain = active ? cue.gains[i] : neutralLampGains[i];
      score.groups[i].set(tint.r, tint.g, tint.b, gain);
      const spill = score.spill[i].copy(fixtureBase);
      const weight = active && i !== ControlLamp.Route ? .18 + cue.energy * .48 : 0;
      if (weight) {
        tint.lerp(accent, .20).multiplyScalar(.92 + .53 * gain);
        spill.set(tint.r, tint.g, tint.b).lerp(fixtureBase, 1 - weight);
      }
    }
    tint.copy(from.rim).lerp(to.rim, blend);
    this.gateFace.copy(from.pane).lerp(to.pane, blend).lerp(tint, migration * .60).multiplyScalar(cue.paneGain);
    this.gateRim.set(tint.r, tint.g, tint.b, view === 'all' || view === 'glass' ? cue.rim : 0);
    const index = this.zones.findIndex(zone => station < zone.end);
    securityTint(this.zones[index] ?? exit, this.zones[index + 1], station, this.railBounce, this.signalTarget);
    const rail = score.groups[ControlLamp.Rail];
    this.railBounce.lerp(tint.setRGB(rail.x, rail.y, rail.z), focus === -1 ? .24 + cue.amount * .18 : 0)
      .multiplyScalar(.005 + rail.w * .018);
    return .0055 - .00118 * well - .00052 * core - .0010 * outside;
  }

  get lighting() {
    const { beat, phrase, amount, travel, relay } = this.cue;
    return { beat, room: this.zoneAt(this.score.spatial.x).name, phrase, amount, travel, relay, rim: this.gateRim.w,
      pane: this.gateFace.toArray(),
      fixtures: this.score.groups.slice(0, 4).map(({ x, y, z, w }) => [x, y, z, w]) };
  }

  build(from: number, to: number) {
    const geometry = buildFacilityArchitecture(this.path, this.zones, from, to);
    const structure = new THREE.Mesh(geometry.structure, this.shell);
    const fixtures = new THREE.Mesh(geometry.fixtures, this.fixtures);
    const security = new THREE.Mesh(geometry.security, this.security);
    const installations = geometry.installations.build(this.installation);
    if (installations) {
      installations.onBeforeRender = () => { this.installation.uniformsNeedUpdate = true; };
    }
    structure.name = 'facility-structure';
    fixtures.name = 'facility-fixtures';
    security.name = 'facility-security';
    return installations ? [structure, fixtures, security, installations] : [structure, fixtures, security];
  }

  junction(path: BranchPath, layout: BranchLayout) {
    this.score.transfer.set(path.start, path.split, path.end);
    return new DescentJunction(path, layout, this.shell, this.security, this.installation);
  }

  dispose() {
    this.shell.dispose();
    this.fixtures.dispose();
    this.security.dispose();
    this.installation.dispose();
  }
}
