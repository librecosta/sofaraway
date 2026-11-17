import * as THREE from 'three';
import type { facilityZones } from '../core/descent-facility';
import { SECTION, SECTION_OUTLINE } from '../core/section';
import { ControlLamp, FacilityLightShape } from '../core/descent-lighting';
import { alarmCollars, controlCells, FacilityInstallations, installationFade, pressureRakes, releaseInterlock, statorLenses }
  from './descent-installations.client';
import { IndustrialGeometry, IndustrialSurface, IndustrialTrim } from './industrial-geometry';
import type { Path, PathFrame } from './path';

type Zone = ReturnType<typeof facilityZones>[number];
const steel = new THREE.Color(0x536575);
const alloy = new THREE.Color(0x79868c);
const structural = new THREE.Color(0x33424c);
const statorSteel = new THREE.Color(0x45525b);
const lining = new THREE.Color(0x242d34);
const equipment = new THREE.Color(0x4e626e);
const lamp = new THREE.Color(0xaec7d5);
const restLens = {
  ORDER: [0xb9d5e7, 0xc5cfdb], LOCK: [0x83cce6, 0x879fdd], FLIGHT: [0x81c9e1, 0x849fdb],
  PRESSURE: [0x9696d9, 0xb393cc], HOLD: [0x94adc9, 0x849dc3],
  LOCKDOWN: [0xc4bbb3, 0xc8b7a6], BREACH: [0xb3d7e3, 0x84bacb],
} as const;
const pressureAccent = new THREE.Color(0xd098cc);
const alarmAccent = new THREE.Color(0xef5337);
const lockdownAmber = new THREE.Color(0xfaa246);
const innerScale = 1.17;
const flightCollarThroat = innerScale - .032;
const shellStep = 6;
const workReach = 18;
const workPadding = workReach + 11;
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

export const point = (frame: PathFrame, x: number, y: number, depth = 0) =>
  frame.p.clone().addScaledVector(frame.r, x).addScaledVector(frame.u, y).addScaledVector(frame.f, depth);

export function section(frame: PathFrame, xScale: number, yScale: number) {
  return SECTION_OUTLINE.map(([x, y]) => point(frame, x * xScale, y * yScale));
}

export function crossBeam(batch: IndustrialGeometry, frame: PathFrame, a: readonly [number, number],
  b: readonly [number, number], width: number, depth: number, tint: THREE.Color, offset = 0,
  surface = IndustrialSurface.Cast) {
  batch.beam(point(frame, ...a, offset), point(frame, ...b, offset), frame.f, width, depth, tint, surface);
}

export function conduit(batch: IndustrialGeometry, a: PathFrame, b: PathFrame, x: number, y: number,
  width: number, height: number, tint: THREE.Color, surface = IndustrialSurface.Cast, endX = x, endY = y,
  trim = IndustrialTrim.None) {
  const corners = [[-width / 2, -height / 2], [width / 2, -height / 2],
    [width / 2, height / 2], [-width / 2, height / 2]];
  const start = corners.map(([dx, dy]) => point(a, x + dx, y + dy));
  const end = corners.map(([dx, dy]) => point(b, endX + dx, endY + dy));
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    batch.quad(start[i], end[i], end[next], start[next], tint, surface, undefined, trim);
  }
}

/** Inset wall assembly. The bevel and return surround a real recess in front of the cabinet. */
function serviceCabinet(batch: IndustrialGeometry, frame: PathFrame, side: number, x: number,
  height: number, length: number, tint: THREE.Color, mountHeight = height) {
  const ring = (setback: number, halfHeight: number, halfLength: number) => [
    point(frame, side * (x + setback), -halfHeight, -halfLength),
    point(frame, side * (x + setback), halfHeight, -halfLength),
    point(frame, side * (x + setback), halfHeight, halfLength),
    point(frame, side * (x + setback), -halfHeight, halfLength),
  ];
  const armor = ring(0, height, length);
  const lip = ring(-.14, height - .27, length - .26);
  const back = ring(.43, height - .27, length - .26);
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    batch.quad(armor[i], lip[i], lip[next], armor[next], tint, IndustrialSurface.Coated);
    batch.quad(lip[i], back[i], back[next], lip[next], structural);
  }
  batch.quad(back[0], back[1], back[2], back[3], lining, IndustrialSurface.Polymer);
  crossBeam(batch, frame, [side * (x + .24), -height + .47], [side * (x + .24), height - .47],
    .12, length * .49, equipment, 0, IndustrialSurface.Coated);
  crossBeam(batch, frame, [side * (x + .11), -.39], [side * (x + .11), .39],
    .027, length * .33, alloy, 0, IndustrialSurface.Machined);
  if (mountHeight > height) for (const level of [-1, 1]) {
    crossBeam(batch, frame, [side * (x + .34), level * (height - .22)],
      [side * (x + .34), level * mountHeight], .21, length * .72, structural);
  }
}

function railSupport(batch: IndustrialGeometry, frame: PathFrame, side: number, level: number,
  depth: number) {
  const y = level * 1.12;
  const profile = (x: number, mid: number, height: number, length: number) => [
    point(frame, side * x, mid - height, -length), point(frame, side * x, mid + height, -length),
    point(frame, side * x, mid + height, length), point(frame, side * x, mid - height, length),
  ];
  const shoe = profile(4, y, .20, depth + .38);
  const seat = profile(4.53, level * 1.31, .28, depth + .12);
  // The open ends are seated inside the rail and the diagonal carrier.
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    batch.quad(shoe[i], seat[i], seat[next], shoe[next], steel, IndustrialSurface.Machined);
  }
}

function cargoSuspension(batch: IndustrialGeometry, frame: PathFrame, w: number, h: number) {
  for (const side of [-1, 1]) for (const level of [-1, 1]) {
    const crown = [side * Math.min(12.3, w * .76), level * h * .80] as const;
    const deck = [side * 9.5, level * 5.35] as const;
    crossBeam(batch, frame, crown, deck, .33, .65, structural);
    crossBeam(batch, frame, [side * 8.34, deck[1]], [side * 11.35, deck[1]], .34, 1.02, steel);
    crossBeam(batch, frame, [deck[0], level * 4.98], deck, .30, 1.20,
      alloy, 0, IndustrialSurface.Machined);
    crossBeam(batch, frame, [side * 8.07, level * 4.73], [side * 9.75, level * 5.19], .28, .82,
      steel, 0, IndustrialSurface.Coated);
  }
}

function wellServiceDeck(batch: IndustrialGeometry, frame: PathFrame, width: number, height: number) {
  const w = width * SECTION.a, h = height * SECTION.b;
  for (const side of [-1, 1]) {
    serviceCabinet(batch, frame, side, 13.02, h * .34, 2.45, equipment);
    // The offset maintenance deck bears on the primary deck and on the continuous outer pier.
    const innerEdge = side * 13.32;
    crossBeam(batch, frame, [innerEdge, -h * .55], [innerEdge, h * .55], .25, 1.01,
      steel, 5.6, IndustrialSurface.Machined);
    for (const level of [-1, 1]) {
      const inner = [innerEdge, level * h * .52] as const;
      const deckEdge = [side * 10.17, level * h * .34] as const;
      const pier = [side * width * 2.77, level * height * 1.84] as const;
      const fascia = (x: number, y: number, depth: number) => point(frame, side * x, level * y, depth);
      // A beveled apron spreads the inner bearing into the face of the primary deck.
      const a = fascia(9.81, h * .18, -1.84), b = fascia(10.65, h * .18, -1.84);
      const c = fascia(13.64, h * .40, -1.57), d = fascia(10.96, h * .40, -1.67);
      batch.quad(a, b, c, d, alloy, IndustrialSurface.Coated);
      batch.quad(d, c, fascia(13.64, h * .40, -1.39), fascia(10.96, h * .40, -1.38), steel);
      batch.quad(a, d, fascia(10.96, h * .40, -1.38), fascia(9.81, h * .18, -1.52), steel);
      batch.beam(point(frame, ...inner, 5.6), point(frame, ...pier), frame.u, .46, .44, structural);
      batch.beam(point(frame, ...deckEdge), point(frame, ...inner, 5.6), frame.u, .41, .50, steel);
      crossBeam(batch, frame, [side * 10.21, level * h * .27], [side * 10.21, level * h * .40],
        .39, 1.85, alloy, 0, IndustrialSurface.Machined);
      crossBeam(batch, frame, [pier[0] * .94, pier[1]], [pier[0] * 1.04, pier[1]], .64, 2.24, steel);
      crossBeam(batch, frame, [innerEdge, level * h * .53], [innerEdge, level * h * .69],
        .48, 1.33, equipment, 5.6, IndustrialSurface.Coated);
    }
  }
}

function statorMounts(batch: IndustrialGeometry, frame: PathFrame, width: number, height: number) {
  // Eight radial mounts bolt the inner machined ring to the face of the outer casting.
  for (const side of [-1, 1]) for (const level of [-1, 1]) {
    for (const angle of [Math.PI / 8, Math.PI * 3 / 8]) {
      const at = (x: number, y: number, offset: number, d: number) => point(frame,
        side * SECTION.a * x * Math.cos(angle + d), level * SECTION.b * y * Math.sin(angle + d), offset);
      const inner = (offset: number, d: number) => at(3.54, 3.14, offset, d);
      const outer = (offset: number, d: number) => at(width * .57, height * .67, offset, d);
      const a = inner(-1.24, -.041), b = inner(-1.24, .041);
      const c = outer(-2.86, .068), d = outer(-2.86, -.068);
      batch.quad(a, b, c, d, alloy, IndustrialSurface.Machined, undefined, IndustrialTrim.PolishedLip);
      batch.quad(a, d, outer(-2.20, -.068), inner(-.98, -.041), structural);
      batch.quad(c, b, inner(-.98, .041), outer(-2.20, .068), structural);
      batch.quad(d, c, outer(-2.20, .068), outer(-2.20, -.068), steel);
      // Segmented facing keys wrap the rim on either side of each radial mount.
      for (const [from, to] of [[-.25, -.076], [.076, .25]]) {
        const inA = at(2.98, 2.58, -1.19, from), inB = at(2.98, 2.58, -1.19, to);
        const outA = at(3.71, 3.29, -2.62, from), outB = at(3.71, 3.29, -2.62, to);
        batch.quad(inA, inB, outB, outA, alloy, IndustrialSurface.Machined, undefined, IndustrialTrim.PolishedLip);
        batch.quad(inB, inA, at(2.98, 2.58, -.92, from), at(2.98, 2.58, -.92, to), steel);
        batch.quad(outA, outB, at(3.71, 3.29, -2.18, to), at(3.71, 3.29, -2.18, from), steel);
      }
    }
  }
}

function roofBulkhead(batch: IndustrialGeometry, frame: PathFrame, width: number, height: number) {
  const outer = section(frame, width, height);
  const inner = section(frame, width - .21, height - .23);
  const rear = (p: THREE.Vector3) => p.clone().addScaledVector(frame.f, -.86);
  for (const i of [3, 4, 5]) {
    const a = inner[i], b = inner[i + 1];
    const c = outer[i + 1], d = outer[i];
    batch.quad(a, b, c, d, alloy, IndustrialSurface.Machined, undefined, IndustrialTrim.PolishedLip);
    batch.quad(b, a, rear(a), rear(b), structural);
    batch.quad(rear(a), rear(d), rear(c), rear(b), steel);
  }
  batch.quad(inner[3], outer[3], rear(outer[3]), rear(inner[3]), structural);
  batch.quad(outer[6], inner[6], rear(inner[6]), rear(outer[6]), structural);
}

/** A closed collar with a real open throat and continuous thickness around its perimeter. */
export function collar(batch: IndustrialGeometry, frame: PathFrame, x: number, y: number,
  outerX: number, outerY: number, depth: number, face: THREE.Color, inside: THREE.Color,
  shape: readonly (readonly [number, number])[] = SECTION_OUTLINE, lip = IndustrialSurface.Polymer,
  finish = IndustrialSurface.Cast) {
  const outline = (width: number, height: number, offset: number) => shape
    .map(([u, v]) => point(frame, u * width, v * height, offset));
  const a = outline(x, y, -depth), b = outline(outerX, outerY, -depth);
  const c = outline(x, y, depth), d = outline(outerX, outerY, depth);
  const faceTrim = finish === IndustrialSurface.Machined ? IndustrialTrim.PolishedLip : IndustrialTrim.None;
  const throatTrim = lip === IndustrialSurface.Machined ? IndustrialTrim.PolishedLip : IndustrialTrim.None;
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    batch.quad(a[i], b[i], b[j], a[j], face, finish, undefined, faceTrim);
    batch.quad(c[j], d[j], d[i], c[i], face, finish, undefined, faceTrim);
    batch.quad(a[j], c[j], c[i], a[i], inside, lip, undefined, throatTrim);
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

function bayAtOrAfter(zone: Zone, station: number) {
  return Math.max(0, Math.ceil((station - zone.start - 2) / zone.bay));
}

function releaseStation(zone: Zone) { return zone.start + (zone.finish - zone.start) * .51; }

function hasFlightCollar(zone: Zone, bay: number, station: number) {
  if (zone.name === 'CORE') return bay % 2 === 0;
  return zone.name !== 'BREACH' || station <= releaseStation(zone);
}

function securityBase(zone: Zone, out: THREE.Color) {
  if (zone.name === 'LOCKDOWN') return out.copy(lockdownAmber);
  return out.setHex(zone.light).multiplyScalar(zone.name === 'CORE' ? .38 : zone.name === 'BREACH' ? .55 : 1);
}

export function securityTint(zone: Zone, next: Zone | undefined, station: number, out: THREE.Color, target: THREE.Color) {
  securityBase(zone, out);
  const progress = THREE.MathUtils.smoothstep(station, zone.start, zone.finish);
  if (zone.name === 'THE WELL') out.lerp(pressureAccent, progress * .72);
  if (zone.name === 'LOCKDOWN') out.lerp(alarmAccent, progress * .77);
  if (next) {
    const blend = THREE.MathUtils.smoothstep(station, zone.end - 32, zone.end);
    if (blend > 0) out.lerp(securityBase(next, target), blend);
  }
  if (zone.name === 'BREACH') out.multiplyScalar(1 - progress * .43);
  return out;
}

function buildWorkLights(path: Path, zones: readonly Zone[], from: number, to: number) {
  const fixtures = new IndustrialGeometry(undefined, true);
  const housing = new THREE.Color();
  const nextHousing = new THREE.Color();
  const sources: { station: number; extent: number; origin: THREE.Vector3; toEnd: THREE.Vector3;
    inverseLength: number; reachSq: number; group: ControlLamp; gain: number }[] = [];
  for (const [i, zone] of zones.entries()) {
    const first = bayAtOrAfter(zone, from - workPadding);
    const limit = Math.min(zone.end, to + workPadding);
    for (let bay = first, s = zone.start + 2 + first * zone.bay; s < limit; s += zone.bay, bay++) {
      const frame = path.sample(s);
      const [width, height] = dimensions(s, i, zones);
      const w = width * SECTION.a, h = height * SECTION.b;
      const depth = zone.name === 'LOCKDOWN' ? 1.16 : .48;
      const next = zones[i + 1];
      const fade = next ? THREE.MathUtils.smoothstep(s, zone.end - 32, zone.end) : 0;
      const fixture = (a: readonly [number, number], b: readonly [number, number], halfWidth: number,
        halfDepth: number, reach: number, offset = 0, group = a[1] + b[1] >= 0 ? ControlLamp.Roof : ControlLamp.Floor,
        spillOnly = false) => {
        const origin = point(frame, ...a, offset), end = point(frame, ...b, offset);
        if (!spillOnly && s >= from && s < to) {
          fixtures.lightAt(group, s + offset);
          const surface = group === ControlLamp.Roof || group === ControlLamp.Floor;
          if (surface) {
            housing.setHex(restLens[zone.section][group]);
            if (next && fade) housing.lerp(nextHousing.setHex(restLens[next.section][group]), fade);
          }
          fixtures.beam(origin, end, frame.f, halfWidth, halfDepth, surface ? housing : lamp);
        }
        const toEnd = end.sub(origin);
        sources.push({ station: s + offset, extent: reach + 5, origin, toEnd,
          inverseLength: 1 / toEnd.lengthSq(), reachSq: reach ** 2, group, gain: spillOnly ? .28 : 1 });
      };
      if (hasFlightCollar(zone, bay, s)) {
        // Recess the strips into the flat top and bottom faces of the collar throat.
        const mountY = SECTION.b * flightCollarThroat - .025;
        for (const side of [-1, 1]) for (const level of [-1, 1]) {
          fixture([side * .94, level * mountY], [side * 2.03, level * mountY], .047, depth + .018, 6.8);
        }
      }
      if (zone.name === 'TRANSIT') {
        for (const level of [-1, 1]) fixture([-w * .52, level * h * .73], [w * .52, level * h * .73], .062, 1.14, 10);
      }
      if (zone.name === 'THE WELL') {
        const y = h * .79;
        for (const side of [-1, 1]) {
          fixture([side * 9.72, -6.4], [side * 9.72, 6.4], .085, 1.80, 14, 0, ControlLamp.Deck);
          fixture([side * 13.12, -y * .60], [side * 13.12, y * .60], .061, .66, workReach, 5.6, ControlLamp.DeepDeck);
          for (const level of [-1, 1]) {
            fixture([side * 10.18, level * y * .45], [side * 13.55, level * y * .51],
              0, 0, 7.5, -1.86, ControlLamp.DeepDeck, true);
          }
        }
      }
      if (zone.name === 'CORE' && bay % 2 === 0) {
        for (const side of [-1, 1]) for (const level of [-1, 1]) {
          fixture([side * 3.3, level * 8.66], [side * 7.24, level * 8.11], .075, 1.10, 15, 0, ControlLamp.Stator);
          fixture([side * 6.3, level * 2.75], [side * 12.1, level * 5.95], 0, 0, 8.0, -2.36, ControlLamp.Stator, true);
        }
      }
      // These sources sit at the security strips emitted in the other batch.
      const service = layouts[zone.name];
      const released = zone.name === 'BREACH' && s > releaseStation(zone);
      const y = service.serviceY * (released ? .42 : .87) * .64;
      for (const side of [-1, 1]) {
        const x = side * (service.serviceX - .54);
        fixture([x, -y], [x, released ? 0 : y], 0, 0, 2.8, 0, side < 0 ? ControlLamp.Left : ControlLamp.Right, true);
      }
      if (zone.name === 'LOCKDOWN') {
        for (const level of [-1, 1]) {
          fixture([-2.26, level * 4.13], [2.26, level * 4.13], 0, 0, 3.7, 0, ControlLamp.Alarm, true);
        }
      }
    }
  }
  let nearby: typeof sources = [];
  const towardLight = new THREE.Vector3();
  const structure = new IndustrialGeometry((vertex, normal, target) => {
    let irradiance = 0, strongest = 0;
    for (const { origin, toEnd, inverseLength, reachSq, group, gain, station } of nearby) {
      towardLight.subVectors(origin, vertex);
      const t = THREE.MathUtils.clamp(-towardLight.dot(toEnd) * inverseLength, 0, 1);
      towardLight.addScaledVector(toEnd, t);
      const distSq = towardLight.lengthSq();
      if (distSq >= reachSq) continue;
      // The strips light the double-sided plates, with weaker spill along grazing faces.
      const incidence = Math.abs(normal.dot(towardLight)) / Math.sqrt(Math.max(distSq, .25));
      const falloff = 1 - distSq / reachSq;
      const strength = gain * falloff ** 3 * (.16 + .84 * incidence);
      irradiance += strength;
      if (strength > strongest) {
        strongest = strength;
        target.group = group;
        target.station = station;
      }
    }
    // Compress overlapping fixtures smoothly so adjacent faces keep their lighting contrast.
    return irradiance / (.64 + irradiance);
  });
  const lightAt = (station: number) => {
    nearby = sources.filter(source => Math.abs(source.station - station) <= source.extent);
  };
  return { structure, fixtures, lightAt };
}

function escapeViaduct(path: Path, from: number, to: number, start: number, metal: IndustrialGeometry,
  security: IndustrialGeometry, installations: FacilityInstallations, lightAt: (station: number) => void) {
  const deckY = -SECTION.b * 5.30;
  const deckWidth = (SECTION.a - SECTION.ch) * 6.20;
  const deckColor = new THREE.Color(0x3d515c), lights = new THREE.Color(0x9ad9dd);
  // Rails cross the former shell opening on an exposed loading deck. The
  // outboard piers carry separate service ways below the player's horizon.
  const stations = [from];
  for (let s = (Math.floor(from / 18) + 1) * 18; s < to; s += 18) stations.push(s);
  stations.push(to);
  for (let i = 1; i < stations.length; i++) {
    const s0 = stations[i - 1], s1 = stations[i];
    const a = path.sample(s0), b = path.sample(s1);
    lightAt(s0);
    conduit(metal, a, b, 0, deckY - 1.2, deckWidth * 2, 2.4, deckColor, IndustrialSurface.Coated);
    security.lightAt(ControlLamp.Rail, s0, s1);
    for (const side of [-1, 1]) {
      const rail = side * (SECTION.a + .18);
      for (const level of [-1, 1]) {
        conduit(metal, a, b, rail, level * 1.12, .24, .25, steel, IndustrialSurface.Machined);
        conduit(security, a, b, rail - side * .135, level * 1.12, .014, .028, lights);
      }
      conduit(metal, a, b, side * 29, deckY - 4, 8, 3.8, structural);
      const lane = [side * (deckWidth - 1.15), deckY + .065] as const;
      installations.track(a, b, lane, [1, 0], .68, s0, s1,
        ControlLamp.Rail, FacilityLightShape.Release, side > 0 ? .5 : 0, .76);
    }
  }
  const spacing = 78;
  for (let bay = Math.ceil((from - start) / spacing); start + bay * spacing < to; bay++) {
    const s = start + bay * spacing;
    const frame = path.sample(s);
    lightAt(s);
    for (const side of [-1, 1]) {
      crossBeam(metal, frame, [side * 4.01, -1.16], [side * 7.8, deckY + .2], .35, 1.16, steel);
      crossBeam(metal, frame, [side * 4, 1.12], [side * 5.10, -5.3], .24, .93, alloy);
      crossBeam(metal, frame, [side * 29, deckY + 19], [side * 34, deckY - 31], 1.38, 3.6, structural);
      crossBeam(metal, frame, [side * 29.5, deckY + 14], [side * 45, deckY + 4], 1.05, 2.9, structural);
      crossBeam(metal, frame, [side * 9, deckY - 4], [side * 32, deckY - 4], 1.28, 3.0, steel);
      security.lightAt(ControlLamp.Rail, s);
      crossBeam(security, frame, [side * 29.51, deckY + 13.9], [side * 30.2, deckY + 7], .10, 3.62, lights);
      if (bay % 3 === 1) {
        // Cargo lifts share the outboard pier and reach across the distant service way.
        conduit(metal, path.sample(s - 7), path.sample(s + 7), side * 34, deckY + 5, 8, 43, structural);
        crossBeam(metal, frame, [side * 34, deckY + 22], [side * 59, deckY + 19], 1.3, 4.5, deckColor);
        crossBeam(metal, frame, [side * 37, deckY + 14], [side * 52, deckY + 19], .65, 3.1, steel);
      }
    }
    if (s === start) crossBeam(metal, frame, [-deckWidth, deckY], [deckWidth, deckY], .53, 1.18, steel);
  }
}

export function buildFacilityArchitecture(path: Path, zones: readonly Zone[], from: number, to: number, escapeStart = Infinity) {
  const facilityEnd = Math.min(to, escapeStart);
  const { structure: metal, fixtures, lightAt } = buildWorkLights(path, zones, from, Math.max(from, facilityEnd));
  const security = new IndustrialGeometry(undefined, true);
  const installations = new FacilityInstallations();
  const tone = new THREE.Color(), signal = new THREE.Color(), signalTarget = new THREE.Color();
  for (const [i, zone] of zones.entries()) {
    const start = Math.max(from, zone.start), end = Math.min(facilityEnd, zone.end);
    if (start >= end - 1e-7) continue;
    const armor = new THREE.Color(zone.armor);
    const nextZone = zones[i + 1];
    const service = layouts[zone.name];
    const roofRelease = releaseStation(zone);
    const stations = [start];
    for (let s = (Math.floor(start / shellStep) + 1) * shellStep; s < end - 1e-7; s += shellStep) stations.push(s);
    stations.push(end);
    if (zone.name === 'BREACH' && roofRelease > start && roofRelease < end) {
      const next = stations.findIndex(station => station >= roofRelease);
      if (stations[next] !== roofRelease) stations.splice(next, 0, roofRelease);
    }
    const frames = stations.map(s => path.sample(s));
    const sizes = stations.map(s => dimensions(s, i, zones));
    const walls = frames.map((frame, j) => section(frame, ...sizes[j]));
    const inner = frames.map(frame => section(frame, innerScale, innerScale));
    for (let j = 0; j < frames.length - 1; j++) {
      const a = frames[j], b = frames[j + 1];
      const span = [stations[j], stations[j + 1]] as const;
      const mid = (span[0] + span[1]) / 2;
      lightAt(mid);
      securityTint(zone, nextZone, mid, signal, signalTarget);
      security.lightAt(ControlLamp.Rail, ...span);
      const outside = zone.name === 'BREACH' && mid > roofRelease;
      const tracks = zone.name === 'TRANSIT' || zone.name === 'BREACH';
      const trackFade = tracks ? installationFade(mid, zone.start, zone.name === 'BREACH' ? zone.finish + 190 : zone.end) : 0;
      for (const [k, edge] of walls[j].entries()) {
        const next = (k + 1) % walls[j].length;
        const shade = k % 4 === 0 ? .91 : k % 4 === 2 ? 1.15 : .82;
        if (!outside || k < 3 || k > 5) {
          metal.quad(edge, walls[j][next], walls[j + 1][next], walls[j + 1][k], tone.copy(armor).multiplyScalar(shade),
            IndustrialSurface.Cast, span);
        }
        if (innerPanel(zone.name, k, mid, zone)) {
          metal.quad(inner[j][k], inner[j][next], inner[j + 1][next], inner[j + 1][k],
            tone.copy(armor).lerp(steel, .38).multiplyScalar(shade), IndustrialSurface.Coated, span);
        }
      }
      if (outside) for (const side of [-1, 1]) {
        const [x, y] = SECTION_OUTLINE[3];
        conduit(metal, a, b, side * x * sizes[j][0], y * sizes[j][1], .47, .44, steel,
          IndustrialSurface.Machined, side * x * sizes[j + 1][0], y * sizes[j + 1][1]);
      }
      for (const side of [-1, 1]) for (const level of [-1, 1]) {
        const rail = side * (SECTION.a + .18);
        conduit(metal, a, b, rail, level * 1.12, .24, .25, steel, IndustrialSurface.Machined,
          rail, level * 1.12, IndustrialTrim.SecurityRail);
        conduit(security, a, b, rail - side * .135, level * 1.12, .014, .028, tone.copy(signal).multiplyScalar(.59));
        if (tracks && (!outside || level < 0)) {
          const stationPhase = (side > 0 ? .50 : 0) + (level > 0 ? .25 : 0);
          installations.track(a, b, [rail - side * .124, level * 1.12], [0, 1], .246, ...span,
            ControlLamp.Rail, zone.name === 'BREACH' ? FacilityLightShape.Release : FacilityLightShape.Flow, stationPhase, trackFade);
          if (zone.name === 'TRANSIT') {
            installations.track(a, b, [side * 8.251, level * 5.08], [0, 1], .42, ...span,
              level < 0 ? ControlLamp.Floor : ControlLamp.Roof, FacilityLightShape.Flow, stationPhase, trackFade * .84);
            if (innerPanel(zone.name, 0, mid, zone)) {
              installations.track(a, b, [side * 2.76, level * (SECTION.b * innerScale - .031)], [1, 0], 1.08, ...span,
                level < 0 ? ControlLamp.Floor : ControlLamp.Roof, FacilityLightShape.Flow, stationPhase, trackFade);
            }
          } else if (level < 0) {
            const floor = (j: number) => [side * 5.45, -SECTION.b * sizes[j][1] + .067] as const;
            installations.track(a, b, floor(j), [1, 0], 1.63, ...span, ControlLamp.Floor,
              FacilityLightShape.Release, stationPhase, trackFade, floor(j + 1));
          }
        }
        if (!outside || level < 0) {
          conduit(metal, a, b, side * service.serviceX, level * service.serviceY, .58,
            zone.name === 'THE WELL' ? 1.15 : .62, structural);
        }
        if (zone.name === 'TRANSIT') {
          // An elevated cargo way runs outboard of the player conduit.
          conduit(metal, a, b, side * 10.2, level * 5.35, 3.75, .58, structural);
          conduit(metal, a, b, side * 8.44, level * 5.08, .36, .45, alloy, IndustrialSurface.Machined);
        }
        if (zone.name === 'THE WELL') {
          conduit(metal, a, b, side * sizes[j][0] * 2.77, level * sizes[j][1] * 1.84, 2.9, 4.3, steel, IndustrialSurface.Cast,
            side * sizes[j + 1][0] * 2.77, level * sizes[j + 1][1] * 1.84);
        }
      }
    }
    if (zone.name === 'BREACH' && roofRelease >= start && roofRelease < end) {
      lightAt(roofRelease);
      roofBulkhead(metal, path.sample(roofRelease), ...dimensions(roofRelease, i, zones));
    }

    const firstBay = bayAtOrAfter(zone, start);
    for (let bay = firstBay, s = zone.start + 2 + firstBay * zone.bay; s < end; s += zone.bay, bay++) {
      const frame = path.sample(s);
      lightAt(s);
      securityTint(zone, nextZone, s, signal, signalTarget);
      const [width, height] = dimensions(s, i, zones);
      const w = width * SECTION.a, h = height * SECTION.b;
      const depth = zone.name === 'LOCKDOWN' ? 1.16 : .48;
      const released = zone.name === 'BREACH' && s > roofRelease;
      const fade = installationFade(s, zone.start, zone.finish);
      const progress = THREE.MathUtils.clamp((s - zone.start) / (zone.finish - zone.start), 0, 1);
      if (hasFlightCollar(zone, bay, s)) {
        collar(metal, frame, flightCollarThroat, flightCollarThroat, innerScale + .075, innerScale + .075, depth, steel, structural);
      }
      for (const side of [-1, 1]) {
        for (const level of [-1, 1]) {
          if (released && level > 0) continue;
          const access: [number, number] = [side * service.serviceX, level * service.serviceY];
          crossBeam(metal, frame, [side * 4.36, level * 1.20], access, .26, depth + .2, steel, 0, IndustrialSurface.Coated);
          if (bay % 2 === 0 || zone.name === 'TRANSIT') railSupport(metal, frame, side, level, depth);
          const tie: [number, number] = [side * w * .91, level * h * (zone.name === 'THE WELL' ? .65 : .73)];
          crossBeam(metal, frame, access, tie, zone.name === 'THE WELL' ? .76 : .36, depth + .35, structural);
        }
        const x = service.serviceX - .33;
        const y = service.serviceY * (released ? .42 : .87);
        crossBeam(metal, frame, [side * x, -y], [side * x, released ? .12 : y],
          zone.name === 'LOCKDOWN' ? .52 : .29, depth + .64, steel, 0, IndustrialSurface.Coated);
        security.lightAt(side < 0 ? ControlLamp.Left : ControlLamp.Right, s);
        crossBeam(security, frame, [side * (x - .21), -y * .64], [side * (x - .21), released ? 0 : y * .64],
          .048, depth + .66, signal);
      }
      switch (zone.name) {
        case 'CONTROL':
          if (zone.section === 'LOCK' && s + 5.5 < zone.end) {
            const lo = s + 2.5, hi = s + 5.5;
            controlCells(installations, path.sample(lo), path.sample(hi), lo, hi, bay, innerScale, width, fade);
          }
          if (bay % 2 === 0 && s + 7.8 < zone.end) {
            const panelFrame = path.sample(s + 4.68);
            lightAt(s + 4.68);
            for (const side of [-1, 1]) {
              serviceCabinet(metal, panelFrame, side, service.serviceX - .33, 1.94, 3.06, steel, service.serviceY);
            }
          }
          break;
        case 'TRANSIT':
          for (const level of [-1, 1]) {
            crossBeam(metal, frame, [-w * .82, level * h * .80], [w * .82, level * h * .80], .73, 1.12, alloy,
              0, IndustrialSurface.Coated);
          }
          cargoSuspension(metal, frame, w, h);
          break;
        case 'THE WELL':
          // On the vertical run these open decks are horizontal floors around the shaft.
          for (const side of [-1, 1]) {
            const x = w * .83, y = h * .79;
            crossBeam(metal, frame, [side * (x + 10) / 2, -y], [side * (x + 10) / 2, y],
              Math.max(.7, (x - 10) / 2), 1.45, structural);
            crossBeam(metal, frame, [-10, side * (y + 8.5) / 2], [10, side * (y + 8.5) / 2],
              Math.max(.7, (y - 8.5) / 2), 1.45, steel);
            crossBeam(metal, frame, [side * 10, -8.5], [side * 10, 8.5], .47, 1.78, alloy, 0, IndustrialSurface.Machined);
            security.lightAt(ControlLamp.Deck, s);
            crossBeam(security, frame, [-6, side * 8.67], [6, side * 8.67], .07, 1.48, signal);
            crossBeam(metal, frame, [side * (x + 13) / 2, -y * .72], [side * (x + 13) / 2, y * .72],
              Math.max(.55, (x - 13) * .50), .62, steel, 5.6);
          }
          wellServiceDeck(metal, frame, width, height);
          pressureRakes(installations, frame, s, bay, width, height, service.serviceX, service.serviceY, fade, progress);
          break;
        case 'CORE':
          if (bay % 2 === 0) {
            collar(metal, frame, 3.65, 3.20, width * .88, height * .82, 2.3, statorSteel, steel,
              statorOutline, IndustrialSurface.Machined);
            collar(metal, frame, 3.03, 2.63, 3.80, 3.36, 1.07, alloy, steel,
              statorOutline, IndustrialSurface.Machined, IndustrialSurface.Machined);
            statorMounts(metal, frame, width, height);
            statorLenses(installations, frame, s, bay, statorOutline, width, height, fade, progress);
          }
          break;
        case 'LOCKDOWN':
          collar(metal, frame, 1.33, 1.30, width * .94, height * .93, 1.43, structural, steel);
          if (bay % 2 === 0 && s + 7.6 < zone.end) {
            for (const side of [-1, 1]) for (const level of [-1, 1]) {
              crossBeam(metal, frame, [side * 5.18, level * 2.43], [side * w * .79, level * h * .65],
                .38, 1.52, steel);
            }
            const panelFrame = path.sample(s + 4.48);
            lightAt(s + 4.48);
            for (const side of [-1, 1]) {
              serviceCabinet(metal, panelFrame, side, service.serviceX - .38, 2.27, 3.08, equipment, service.serviceY);
            }
          }
          security.lightAt(ControlLamp.Alarm, s);
          for (const level of [-1, 1]) {
            crossBeam(security, frame, [-2.26, level * 4.13], [2.26, level * 4.13], .060, 1.46, signal);
          }
          alarmCollars(installations, frame, s, bay, width, height, fade, progress);
          break;
        case 'BREACH':
          releaseInterlock(installations, frame, s, service.serviceX - .56,
            service.serviceY * (released ? .42 : .87) * .64, -.96, bay, progress, fade);
          if (released) {
            for (const side of [-1, 1]) {
              crossBeam(metal, frame, [side * 8.5, -4.8], [side * w * .76, -h * .54], .66, 1.32, steel);
              crossBeam(metal, frame, [side * 6.96, -3.83], [side * 8.78, -5.03], .26, 1.67,
                alloy, 0, IndustrialSurface.Machined);
            }
          }
          break;
      }
    }
  }
  if (escapeStart < to) escapeViaduct(path, Math.max(from, escapeStart), to, escapeStart, metal, security, installations, lightAt);
  return { structure: metal.build(), fixtures: fixtures.build(), security: security.build(), installations };
}
