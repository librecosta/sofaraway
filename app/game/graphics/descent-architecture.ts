import * as THREE from 'three';
import type { facilityZones } from '../core/descent-facility';
import { SECTION, SECTION_OUTLINE } from '../core/section';
import type { IndustrialGeometry } from './industrial-geometry';
import type { Path, PathFrame } from './path';

type Zone = ReturnType<typeof facilityZones>[number];
const steel = new THREE.Color(0x536575);
const alloy = new THREE.Color(0x79868c);
const structural = new THREE.Color(0x33424c);
const lamp = new THREE.Color(0xaec7d5);
const innerScale = 1.17;
const shellStep = 6;
const statorOutline = Array.from({ length: 24 }, (_, i) => {
  const a = i * Math.PI / 12;
  return [Math.cos(a) * SECTION.a, Math.sin(a) * SECTION.b] as const;
});
const layouts = {
  CONTROL: { serviceX: 5.40, serviceY: 2.60 },
  TRANSIT: { serviceX: 8.05, serviceY: 4.70 },
  'THE WELL': { serviceX: 8.65, serviceY: 6.60 },
  CORE: { serviceX: 10.2, serviceY: 6.20 },
  LOCKDOWN: { serviceX: 6.05, serviceY: 3.40 },
  BREACH: { serviceX: 7.40, serviceY: 4.50 },
} as const;

const point = (frame: PathFrame, x: number, y: number, depth = 0) =>
  frame.p.clone().addScaledVector(frame.r, x).addScaledVector(frame.u, y).addScaledVector(frame.f, depth);

function section(frame: PathFrame, xScale: number, yScale: number) {
  return SECTION_OUTLINE.map(([x, y]) => point(frame, x * xScale, y * yScale));
}

function crossBeam(batch: IndustrialGeometry, frame: PathFrame, a: readonly [number, number],
  b: readonly [number, number], width: number, depth: number, tint: THREE.Color, offset = 0) {
  batch.beam(point(frame, ...a, offset), point(frame, ...b, offset), frame.f, width, depth, tint);
}

function conduit(batch: IndustrialGeometry, a: PathFrame, b: PathFrame, x: number, y: number,
  width: number, height: number, tint: THREE.Color, endX = x, endY = y) {
  const corners = [[-width / 2, -height / 2], [width / 2, -height / 2],
    [width / 2, height / 2], [-width / 2, height / 2]];
  const start = corners.map(([dx, dy]) => point(a, x + dx, y + dy));
  const end = corners.map(([dx, dy]) => point(b, endX + dx, endY + dy));
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    batch.quad(start[i], end[i], end[next], start[next], tint);
  }
}

/** A closed collar with a real open throat and continuous thickness around its perimeter. */
function collar(batch: IndustrialGeometry, frame: PathFrame, x: number, y: number,
  outerX: number, outerY: number, depth: number, face: THREE.Color, inside: THREE.Color,
  shape: readonly (readonly [number, number])[] = SECTION_OUTLINE) {
  const outline = (width: number, height: number, offset: number) => shape
    .map(([u, v]) => point(frame, u * width, v * height, offset));
  const a = outline(x, y, -depth), b = outline(outerX, outerY, -depth);
  const c = outline(x, y, depth), d = outline(outerX, outerY, depth);
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    batch.quad(a[i], b[i], b[j], a[j], face);
    batch.quad(c[j], d[j], d[i], c[i], face);
    batch.quad(a[j], c[j], c[i], a[i], inside);
    batch.quad(b[i], d[i], d[j], b[j], inside);
  }
}

function dimensions(station: number, index: number, zones: readonly Zone[]) {
  const { width, height, start, end, finish, name } = zones[index];
  let w: number = width, h: number = height;
  const neighbor = station - start < 28 ? zones[index - 1] : end - station < 28 ? zones[index + 1] : undefined;
  if (neighbor) {
    const distance = neighbor.start < start ? station - start : end - station;
    const weight = .5 * (1 - THREE.MathUtils.smoothstep(distance, 0, 28));
    w += (neighbor.width - width) * weight;
    h += (neighbor.height - height) * weight;
  }
  const opening = name === 'BREACH' ? THREE.MathUtils.smoothstep(station, start, finish) : 0;
  return [w + opening * 2.1, h + opening * 1.4] as const;
}

function innerPanel(name: Zone['name'], face: number, station: number, zone: Zone) {
  const slab = face % 4 === 0;
  const side = face % 4 === 2;
  const phase = ((station - zone.start) % zone.bay) / zone.bay;
  if (name === 'CONTROL') return slab || (!side && phase < .56);
  if (name === 'LOCKDOWN') return slab || (phase < .45 && !side);
  if (name === 'TRANSIT') return slab && phase < .48;
  if (name === 'BREACH') return slab && station < zone.start + (zone.finish - zone.start) * .36;
  return false;
}

export function buildFacilityArchitecture(path: Path, zones: readonly Zone[], from: number, to: number,
  metal: IndustrialGeometry, lights: IndustrialGeometry, security: IndustrialGeometry) {
  const tone = new THREE.Color();
  for (const [i, zone] of zones.entries()) {
    const start = Math.max(from, zone.start), end = Math.min(to, zone.end);
    if (start >= end - 1e-7) continue;
    const armor = new THREE.Color(zone.armor), signal = new THREE.Color(zone.light);
    const service = layouts[zone.name];
    const stations = [start];
    for (let s = (Math.floor(start / shellStep) + 1) * shellStep; s < end - 1e-7; s += shellStep) stations.push(s);
    stations.push(end);
    const frames = stations.map(s => path.sample(s));
    const sizes = stations.map(s => dimensions(s, i, zones));
    const walls = frames.map((frame, j) => section(frame, ...sizes[j]));
    const inner = frames.map(frame => section(frame, innerScale, innerScale));
    const roofRelease = zone.start + (zone.finish - zone.start) * .51;
    for (let j = 0; j < frames.length - 1; j++) {
      const a = frames[j], b = frames[j + 1];
      const mid = (stations[j] + stations[j + 1]) / 2;
      const outside = zone.name === 'BREACH' && mid > roofRelease;
      for (const [k, edge] of walls[j].entries()) {
        const next = (k + 1) % walls[j].length;
        const shade = k % 4 === 0 ? .91 : k % 4 === 2 ? 1.15 : .82;
        if (!outside || k < 3 || k > 5) {
          metal.quad(edge, walls[j][next], walls[j + 1][next], walls[j + 1][k], tone.copy(armor).multiplyScalar(shade));
        }
        if (innerPanel(zone.name, k, mid, zone)) {
          metal.quad(inner[j][k], inner[j][next], inner[j + 1][next], inner[j + 1][k],
            tone.copy(armor).lerp(steel, .38).multiplyScalar(shade));
        }
      }
      for (const side of [-1, 1]) for (const level of [-1, 1]) {
        const rail = side * (SECTION.a + .18);
        conduit(metal, a, b, rail, level * 1.12, .24, .25, steel);
        conduit(security, a, b, rail - side * .135, level * 1.12, .014, .028, tone.copy(signal).multiplyScalar(.59));
        if (!outside || level < 0) {
          conduit(metal, a, b, side * service.serviceX, level * service.serviceY, .58,
            zone.name === 'THE WELL' ? 1.15 : .62, structural);
        }
        if (zone.name === 'TRANSIT') {
          // An elevated cargo way runs outboard of the player conduit.
          conduit(metal, a, b, side * 10.2, level * 5.35, 3.75, .58, structural);
          conduit(metal, a, b, side * 8.44, level * 5.08, .36, .45, alloy);
        }
        if (zone.name === 'THE WELL') {
          conduit(metal, a, b, side * sizes[j][0] * 2.77, level * sizes[j][1] * 1.84, 2.9, 4.3, steel,
            side * sizes[j + 1][0] * 2.77, level * sizes[j + 1][1] * 1.84);
        }
      }
    }

    const firstBay = Math.max(0, Math.ceil((start - zone.start - 2) / zone.bay));
    for (let bay = firstBay, s = zone.start + 2 + firstBay * zone.bay; s < end; s += zone.bay, bay++) {
      const frame = path.sample(s);
      const [width, height] = dimensions(s, i, zones);
      const w = width * SECTION.a, h = height * SECTION.b;
      const depth = zone.name === 'LOCKDOWN' ? 1.16 : .48;
      const released = zone.name === 'BREACH' && s > roofRelease;
      if (!released && (zone.name !== 'CORE' || bay % 2 === 0)) {
        collar(metal, frame, innerScale - .032, innerScale - .032, innerScale + .075, innerScale + .075, depth, steel, structural);
      }
      for (const side of [-1, 1]) {
        for (const level of [-1, 1]) {
          if (released && level > 0) continue;
          const access: [number, number] = [side * service.serviceX, level * service.serviceY];
          crossBeam(metal, frame, [side * 4.36, level * 1.20], access, .26, depth + .2, steel);
          const tie: [number, number] = [side * w * .91, level * h * (zone.name === 'THE WELL' ? .65 : .73)];
          crossBeam(metal, frame, access, tie, zone.name === 'THE WELL' ? .76 : .36, depth + .35, structural);
          crossBeam(lights, frame, [side * .94, level * 3.27], [side * 2.03, level * 3.27], .047, depth + .018, lamp);
        }
        const x = service.serviceX - .33;
        const y = service.serviceY * (released ? .42 : .87);
        crossBeam(metal, frame, [side * x, -y], [side * x, released ? .12 : y],
          zone.name === 'LOCKDOWN' ? .52 : .29, depth + .64, steel);
        crossBeam(security, frame, [side * (x - .21), -y * .64], [side * (x - .21), released ? 0 : y * .64],
          .048, depth + .66, signal);
      }
      switch (zone.name) {
        case 'TRANSIT':
          for (const level of [-1, 1]) {
            crossBeam(metal, frame, [-w * .82, level * h * .80], [w * .82, level * h * .80], .73, 1.12, alloy);
            crossBeam(lights, frame, [-w * .52, level * h * .73], [w * .52, level * h * .73], .062, 1.14, lamp);
          }
          break;
        case 'THE WELL':
          // On the vertical run these open decks are horizontal floors around the shaft.
          for (const side of [-1, 1]) {
            const x = w * .83, y = h * .79;
            crossBeam(metal, frame, [side * (x + 10) / 2, -y], [side * (x + 10) / 2, y],
              Math.max(.7, (x - 10) / 2), 1.45, structural);
            crossBeam(metal, frame, [-10, side * (y + 8.5) / 2], [10, side * (y + 8.5) / 2],
              Math.max(.7, (y - 8.5) / 2), 1.45, steel);
            crossBeam(metal, frame, [side * 10, -8.5], [side * 10, 8.5], .47, 1.78, alloy);
            crossBeam(lights, frame, [side * 9.72, -6.4], [side * 9.72, 6.4], .085, 1.80, lamp);
            crossBeam(security, frame, [-6, side * 8.67], [6, side * 8.67], .07, 1.48, signal);
            crossBeam(metal, frame, [side * (x + 13) / 2, -y * .72], [side * (x + 13) / 2, y * .72],
              Math.max(.55, (x - 13) * .50), .62, steel, 5.6);
            crossBeam(lights, frame, [side * 13.12, -y * .60], [side * 13.12, y * .60], .061, .66, lamp, 5.6);
          }
          break;
        case 'CORE':
          if (bay % 2 === 0) {
            collar(metal, frame, 3.65, 3.20, width * .88, height * .82, 2.3, structural, steel, statorOutline);
            collar(metal, frame, 3.03, 2.63, 3.80, 3.36, 1.07, alloy, steel, statorOutline);
            for (const level of [-1, 1]) {
              for (const side of [-1, 1]) {
                crossBeam(lights, frame, [side * 3.3, level * 8.66], [side * 7.24, level * 8.11], .075, 1.10, lamp);
              }
            }
          }
          break;
        case 'LOCKDOWN':
          collar(metal, frame, 1.33, 1.30, width * .94, height * .93, 1.43, structural, steel);
          for (const level of [-1, 1]) {
            crossBeam(security, frame, [-2.26, level * 4.13], [2.26, level * 4.13], .060, 1.46, signal);
          }
          break;
        case 'BREACH':
          if (released) {
            for (const side of [-1, 1]) {
              crossBeam(metal, frame, [side * 8.5, -4.8], [side * w * .76, -h * .54], .66, 1.32, steel);
            }
          }
          break;
      }
    }
  }
}
