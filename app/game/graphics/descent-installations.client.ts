import * as THREE from 'three';
import { ControlLamp, FacilityLightShape } from '../core/descent-lighting';
import { circumference, perimeter, wallSpans, zoneFade } from '../core/lighting-atlas';
import { SECTION } from '../core/section';
import type { PathFrame } from './path';

type Axis = readonly [number, number];

/** Like the corridor atlas, each lens is a transformed quad with world-space phase. */
export class FacilityInstallations {
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly spans: number[] = [];
  private readonly axis = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();

  private append(a: THREE.Vector3, b: THREE.Vector3, across: THREE.Vector3, width: number,
    station: number, length: number, group: ControlLamp, style: FacilityLightShape, phase: number, fade: number,
    progress: number, layer: number) {
    if (fade < .002) return;
    const y = this.axis.subVectors(b, a);
    const x = across.multiplyScalar(width);
    const z = this.normal.crossVectors(x, y).normalize();
    this.matrices.push(new THREE.Matrix4().makeBasis(x, y, z).setPosition(this.center.copy(a).lerp(b, .5)));
    this.spans.push(station, length, group, style + phase, fade, progress, layer);
  }

  plate(frame: PathFrame, a: Axis, b: Axis, width: number, depth: number, station: number,
    group: ControlLamp, style: FacilityLightShape, phase: number, fade: number, progress = 0, layer = 0) {
    const mount = (offset: Axis) => frame.p.clone().addScaledVector(frame.r, offset[0])
      .addScaledVector(frame.u, offset[1]).addScaledVector(frame.f, depth);
    const start = mount(a), end = mount(b);
    const cross = frame.r.clone().multiplyScalar(b[1] - a[1]).addScaledVector(frame.u, a[0] - b[0]).normalize();
    this.append(start, end, cross, width, station + depth, 0, group, style, phase, fade, progress, layer);
  }

  track(entry: PathFrame, exit: PathFrame, at: Axis, across: Axis, width: number, from: number, to: number,
    group: ControlLamp, style: FacilityLightShape, phase: number, fade: number, endAt: Axis = at, progress = 0, layer = 0) {
    const start = entry.p.clone().addScaledVector(entry.r, at[0]).addScaledVector(entry.u, at[1]);
    const end = exit.p.clone().addScaledVector(exit.r, endAt[0]).addScaledVector(exit.u, endAt[1]);
    const transverse = entry.r.clone().multiplyScalar(across[0]).addScaledVector(entry.u, across[1]);
    this.append(start, end, transverse, width, (from + to) * .5, to - from, group, style, phase, fade, progress, layer);
  }

  build(material: THREE.ShaderMaterial) {
    if (!this.matrices.length) return;
    const quad = new THREE.PlaneGeometry(1, 1);
    const count = this.matrices.length;
    const span = new Float32Array(count * 4);
    const cues = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const j = i * 7;
      span.set(this.spans.slice(j, j + 4), i * 4);
      cues.set(this.spans.slice(j + 4, j + 7), i * 3);
    }
    quad.setAttribute('lightSpan', new THREE.InstancedBufferAttribute(span, 4));
    quad.setAttribute('lightCue', new THREE.InstancedBufferAttribute(cues, 3));
    const mesh = new THREE.InstancedMesh(quad, material, count);
    mesh.name = 'facility-installations';
    for (const [i, matrix] of this.matrices.entries()) mesh.setMatrixAt(i, matrix);
    mesh.computeBoundingSphere();
    return mesh;
  }
}

export function controlCells(bank: FacilityInstallations, entry: PathFrame, exit: PathFrame,
  from: number, to: number, ordinal: number, innerScale: number, width: number, fade: number) {
  for (const [i, group] of [ControlLamp.Floor, ControlLamp.Right, ControlLamp.Roof, ControlLamp.Left].entries()) {
    // Use the same octagon face splitter as Staggered Cells, with the facility's panel inset.
    const level = (i + ordinal) % 2 === 0 ? -1 : 1;
    const center = i === 0 ? perimeter[1] / 2 : i === 2 ? (perimeter[4] + perimeter[5]) / 2 :
      i === 1 ? (perimeter[2] + perimeter[3]) / 2 : (perimeter[6] + perimeter[7]) / 2;
    const isSlab = group === ControlLamp.Roof || group === ControlLamp.Floor;
    for (const [a, b] of wallSpans(center + level * (isSlab ? 1.63 : .96), .65)) {
      const scale = innerScale / .966;
      const sideScale = isSlab ? scale : width / .966;
      const x = (a.x + b.x) * .5 * sideScale, y = (a.y + b.y) * .5 * scale;
      const at: Axis = [x + a.nx * .042, y + a.ny * .042];
      bank.track(entry, exit, at, [a.tx, a.ty], isSlab ? 1.62 : 1.26, from, to, group, FacilityLightShape.Cell,
        ((ordinal + i) % 4) / 4, fade);
    }
  }
}

export function pressureRakes(bank: FacilityInstallations, frame: PathFrame, station: number,
  ordinal: number, width: number, height: number, frameX: number, frameY: number, fade: number, progress: number) {
  // One winding offset carries the near rakes into the further tiers, like a helical wash on the shaft.
  const twist = (ordinal % 6) / 6;
  const shift = Math.sin(twist * Math.PI * 2) * 1.13;
  const deck = height * SECTION.b * .79, pier = width * SECTION.a * .83;
  for (const side of [-1, 1]) {
    bank.plate(frame, [side * 9.85, -6.8 + shift], [side * 10.08, 6.8 + shift], .92, -1.83, station,
      ControlLamp.Deck, FacilityLightShape.Rake, twist, fade, progress, 0);
    bank.plate(frame, [side * (pier + 13) / 2, -deck * .62], [side * (pier + 13) / 2, deck * .62],
      1.25, 4.95, station, ControlLamp.DeepDeck, FacilityLightShape.Rake, twist, fade, progress, 1);
    const level = side * (8.5 + Math.min(2.02, (deck - 8.5) * .48));
    bank.plate(frame, [-8.6, level - shift], [8.6, level + shift], 1.72, -1.52, station,
      ControlLamp.Deck, FacilityLightShape.Rake, (twist + (side + 1) * .22) % 1, fade, progress, 0);
    for (const tier of [-1, 1]) {
      bank.plate(frame, [side * 4.56, tier * 1.41], [side * frameX, tier * frameY], .51, -.86,
        station, ControlLamp.Deck, FacilityLightShape.Rake, twist, fade, progress, 0);
      bank.plate(frame, [side * frameX, tier * frameY], [side * pier, tier * deck * .80], .84, -1.01,
        station, ControlLamp.DeepDeck, FacilityLightShape.Rake, twist, fade, progress, 1);
      // These long lenses follow the fascia and the outer pier bearing of the service deck.
      bank.plate(frame, [side * 10.18, tier * deck * .45], [side * 13.55, tier * deck * .51], .56, -1.86,
        station, ControlLamp.DeepDeck, FacilityLightShape.Rake, twist, fade, progress, 1);
      bank.plate(frame, [side * width * 2.77 * .95, tier * height * 1.84], [side * width * 2.77 * 1.03, tier * height * 1.84],
        1.14, -4.34, station, ControlLamp.DeepDeck, FacilityLightShape.Rake, twist, fade, progress, 2);
    }
  }
}

export function statorLenses(bank: FacilityInstallations, frame: PathFrame, station: number, ordinal: number,
  outline: readonly Axis[], width: number, height: number, fade: number, progress: number) {
  const count = outline.length;
  const rings = [[3.45, 3, -1.102, .74], [(3.65 + width * .88) * .52, (3.20 + height * .82) * .52, -2.36, 1.33]] as const;
  for (const [ring, [x, y, depth, lens]] of rings.entries()) {
    for (let index = 0; index < count; index++) {
      const [ax, ay] = outline[index], [bx, by] = outline[(index + 1) % count];
      const phase = (index + ordinal / 2) % count / count;
      bank.plate(frame, [x * ax, y * ay], [x * bx, y * by], lens, depth, station,
        ControlLamp.Stator, FacilityLightShape.Stator, phase, fade, progress, ring);
    }
  }
}

export function alarmCollars(bank: FacilityInstallations, frame: PathFrame, station: number, ordinal: number,
  width: number, height: number, fade: number, progress: number) {
  for (const level of [-1, 1]) {
    bank.plate(frame, [-2.26, level * 4.13], [2.26, level * 4.13], .46, -1.485, station,
      ControlLamp.Alarm, FacilityLightShape.Lock, (ordinal % 4) / 4, fade, progress, level > 0 ? 0 : 1);
  }
  for (const side of [-1, 1]) for (const level of [-1, 1]) {
    const edge = SECTION.a * width;
    const deck = SECTION.b * height;
    const phase = ((ordinal + (side > 0 ? 2 : 0) + (level > 0 ? 1 : 0)) % 4) / 4;
    bank.plate(frame, [side * edge * .48, level * deck * .79], [side * edge * .73, level * deck * .67],
      .39, -1.459, station, ControlLamp.Alarm, FacilityLightShape.Lock, phase, fade, progress);
    bank.plate(frame, [side * edge * .84, level * deck * .60], [side * edge * .86, level * deck * .24],
      .48, -1.459, station, side < 0 ? ControlLamp.Left : ControlLamp.Right, FacilityLightShape.Lock, phase, fade, progress, 1);
  }
}

export function releaseInterlock(bank: FacilityInstallations, frame: PathFrame, station: number,
  x: number, y: number, depth: number, ordinal: number, progress: number, fade: number) {
  for (const side of [-1, 1]) {
    bank.plate(frame, [side * x, -y], [side * x, 0], .49, depth, station,
      ControlLamp.Alarm, FacilityLightShape.Interlock, (ordinal % 3) / 3, fade, progress, side > 0 ? 1 : 0);
  }
}

export function installationFade(station: number, start: number, end: number) {
  return zoneFade(station, start, end, Math.min(32, (end - start) / 4));
}
