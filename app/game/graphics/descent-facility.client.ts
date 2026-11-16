import * as THREE from 'three';
import type { facilityZones } from '../core/descent-facility';
import { SECTION, SECTION_OUTLINE } from '../core/section';
import { IndustrialGeometry } from './industrial-geometry';
import type { Path, PathFrame } from './path';

type Zone = ReturnType<typeof facilityZones>[number];
const steel = new THREE.Color(0x526471);
const trim = new THREE.Color(0x81929a);
const gunmetal = new THREE.Color(0x26343c);
const white = new THREE.Color(0xaac9d5);
const exitGlow = new THREE.Color(0xc6a389);
const interior = new THREE.Color(0x111720);
const stationStep = 6;

const point = (frame: PathFrame, x: number, y: number, depth = 0) =>
  frame.p.clone().addScaledVector(frame.r, x).addScaledVector(frame.u, y).addScaledVector(frame.f, depth);

export class DescentFacility {
  private readonly shell = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide,
    color: 0xe4ebee, metalness: .37, roughness: .64, emissive: 0x4b595e, emissiveIntensity: .17 });
  private readonly fixtures = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });

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
    background.copy(interior).lerp(exitGlow, outside * .5);
    fog.lerp(background, outside * .8);
    this.fixtures.color.setScalar(.60 + .25 * fixtureGain);
  }

  private dimensions(station: number, index: number) {
    const { width, height, start, end, finish, name } = this.zones[index];
    let w: number = width, h: number = height;
    const adjacent = station - start < 21 ? this.zones[index - 1] : end - station < 21 ? this.zones[index + 1] : undefined;
    if (adjacent) {
      const distance = adjacent.start < start ? station - start : end - station;
      const weight = .5 * (1 - THREE.MathUtils.smoothstep(distance, 0, 21));
      w += (adjacent.width - width) * weight;
      h += (adjacent.height - height) * weight;
    }
    const release = name === 'BREACH' ? THREE.MathUtils.smoothstep(station, start + (finish - start) * .0625, finish) : 0;
    return [w + release * .9, h + release * 1.12] as const;
  }

  build(from: number, to: number) {
    const metal = new IndustrialGeometry();
    const emit = new IndustrialGeometry();
    for (const [i, zone] of this.zones.entries()) {
      const start = Math.max(from, zone.start), end = Math.min(to, zone.end);
      if (start >= end - 1e-7) continue;
      const armor = new THREE.Color(zone.armor);
      const light = new THREE.Color(zone.light);
      const rings = [start];
      for (let s = (Math.floor(start / stationStep) + 1) * stationStep; s < end - 1e-7; s += stationStep) rings.push(s);
      rings.push(end);
      const frames = rings.map(s => this.path.sample(s));
      const polys = frames.map((frame, j) => {
        const [width, height] = this.dimensions(rings[j], i);
        return SECTION_OUTLINE.map(([x, y]) => point(frame, x * width, y * height));
      });
      for (let j = 0; j < frames.length - 1; j++) {
        const frame = frames[j], next = frames[j + 1];
        const plate = Math.floor((rings[j] + rings[j + 1]) / (2 * stationStep));
        const openRoof = zone.name === 'BREACH' && rings[j] - zone.start >= (zone.finish - zone.start) * .62;
        for (const [k, a] of polys[j].entries()) {
          if (openRoof && (k === 3 || k === 4 || k === 5)) continue;
          const edge = (k + 1) % SECTION_OUTLINE.length;
          const shade = (k % 4 === 0 ? 1.04 : .90) * (plate % 3 === 2 ? .81 : 1);
          metal.quad(a, polys[j][edge], polys[j + 1][edge], polys[j + 1][k], color.copy(armor).multiplyScalar(shade));
        }
        for (const x of [-1, 1]) for (const y of [-1, 1]) {
          const railX = x * (SECTION.a + .18), railY = y * 1.12;
          strip(metal, frame, next, railX, railY, .24, .25, steel);
          strip(emit, frame, next, railX - x * .135, railY, .015, .035, color.copy(light).multiplyScalar(.71));
        }
      }
      const firstBay = Math.max(0, Math.ceil((start - zone.start - 2) / zone.bay));
      for (let s = zone.start + 2 + firstBay * zone.bay; s < end; s += zone.bay) {
        const frame = this.path.sample(s);
        const [w, h] = this.dimensions(s, i);
        const walls = SECTION_OUTLINE.map(([x, y]) => point(frame, x * w * .968, y * h * .968));
        const ringDepth = zone.name === 'LOCKDOWN' ? .86 : .61;
        for (const [k, a] of walls.entries()) {
          const b = walls[(k + 1) % walls.length];
          metal.beam(a, b, frame.f, .19 + w * .063, ringDepth, k % 2 === 0 ? steel : gunmetal);
          // Every lamp is centered on its edge, independent of the outline's winding.
          emit.beam(a.clone().lerp(b, .32), a.clone().lerp(b, .68), frame.f, .043 + w * .010, ringDepth + .023, light);
        }
        for (const sign of [-1, 1]) {
          const inside = sign * (SECTION.a + .21);
          const outside = sign * SECTION.a * w * .95;
          const height = SECTION.b * h;
          const girderDepth = w > 2 ? 1.70 : .77;
          for (const side of [-1, 1]) {
            metal.beam(point(frame, inside, side * 1.12), point(frame, outside, side * (height * .55)),
              frame.f, .19 + w * .021, girderDepth, steel);
            emit.beam(point(frame, inside + sign * .18, side * 1.12), point(frame, outside * .90, side * (height * .50)),
              frame.f, .032, girderDepth + .02, color.copy(light).lerp(white, .21));
            if (zone.name === 'THE WELL' || zone.name === 'CORE') {
              // Paired service levels leave the center of the shaft clear on both axes.
              const edge = sign * SECTION.a * w * .65;
              const deck = side * height * .49;
              metal.beam(point(frame, edge, deck), point(frame, outside, deck), frame.f, .27, zone.bay * .23, trim);
              metal.beam(point(frame, edge, side * height * .75), point(frame, outside, side * height * .88), frame.f, .22, .67, gunmetal);
              const lamp = deck - side * .29;
              emit.beam(point(frame, edge, lamp), point(frame, outside * .96, lamp), frame.f, .052, .44, light);
            }
          }
          if (zone.name === 'TRANSIT' || zone.name === 'LOCKDOWN') {
            const x = sign * SECTION.a * w * .89;
            const top = height * .60;
            const depth = zone.name === 'LOCKDOWN' ? 1.24 : 2.10;
            metal.beam(point(frame, x, -top), point(frame, x, top), frame.f, .24, depth, gunmetal);
            const lampX = x - sign * .26;
            emit.beam(point(frame, lampX, -top * .29), point(frame, lampX, top * .29), frame.f, .055, depth + .017, light);
          }
        }
        if (zone.name === 'CORE') for (const side of [-1, 1]) {
          const y = side * SECTION.b * h * .67;
          const x = SECTION.a * w * .76;
          metal.beam(point(frame, -x, y), point(frame, x, y), frame.f, .57, 2.35, trim);
          metal.beam(point(frame, -x * .62, y - side * .88), point(frame, x * .62, y - side * .88), frame.f, .38, 1.57, gunmetal);
          emit.beam(point(frame, -x * .48, y - side * 1.28), point(frame, x * .48, y - side * 1.28), frame.f, .075, 1.18, light);
        }
      }
    }
    const shell = new THREE.Mesh(metal.build(), this.shell);
    const lights = new THREE.Mesh(emit.build(), this.fixtures);
    shell.name = 'facility-structure';
    lights.name = 'facility-fixtures';
    return [shell, lights];
  }

  dispose() { this.shell.dispose(); this.fixtures.dispose(); }
}

const color = new THREE.Color();
const fogColor = new THREE.Color();
const endTint = new THREE.Color();

function strip(batch: IndustrialGeometry, a: PathFrame, b: PathFrame,
  x: number, y: number, width: number, height: number, tint: THREE.Color) {
  const outline = [[x - width / 2, y - height / 2], [x + width / 2, y - height / 2],
    [x + width / 2, y + height / 2], [x - width / 2, y + height / 2]];
  const start = outline.map(([px, py]) => point(a, px, py));
  const end = outline.map(([px, py]) => point(b, px, py));
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length;
    batch.quad(start[i], end[i], end[next], start[next], tint);
  }
}
