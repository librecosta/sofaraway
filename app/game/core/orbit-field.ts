import { SECTION_OUTLINE } from './section';

export const ORBIT_WORLD_SEED = 77345;
export const ORBIT_CELL = 144;
export const ORBIT_MAX_RADIUS = 42;
export const ORBIT_CLEARANCE = Math.max(...SECTION_OUTLINE.map(([x, y]) => Math.hypot(x, y))) + 1.5;

export type OrbitDensity = 'flight' | 'sparse' | 'dense';
export type OrbitPoint = readonly [number, number, number];
export interface OrbitBelt {
  readonly density: number;
  readonly coverage: number;
  readonly tilt: number;
  readonly drift: number;
  readonly width: number;
}
export interface OrbitRock {
  readonly id: string;
  readonly cell: string;
  readonly position: OrbitPoint;
  readonly shape: number;
  readonly scale: OrbitPoint;
  readonly rotation: OrbitPoint;
  readonly material: number;
  readonly radius: number;
  readonly fragment: boolean;
  readonly rank: number;
}

export const orbitCellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
const cellIndex = (n: number) => Math.floor(n / ORBIT_CELL);
const tau = Math.PI * 2;

export function orbitRandom(seed: number, x = 0, y = 0, z = 0, index = 0) {
  let state = (seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495)
    ^ Math.imul(z, 0x6c8e9cf5) ^ Math.imul(index, 0x269e431b)) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let bits = Math.imul(state ^ state >>> 15, state | 1);
    bits ^= bits + Math.imul(bits ^ bits >>> 7, bits | 61);
    return ((bits ^ bits >>> 14) >>> 0) / 4294967296;
  };
}

interface Capsule { start: OrbitPoint; end: OrbitPoint; radius: number }

function segmentDistance([x, y, z]: OrbitPoint, [ax, ay, az]: OrbitPoint, [bx, by, bz]: OrbitPoint) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / lengthSq));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy, z - az - t * dz);
}

export class OrbitClearance {
  private readonly cells = new Map<string, Capsule[]>();
  private readonly capsules: Capsule[] = [];

  constructor(length: number, at: (station: number) => OrbitPoint, lookAhead = 104) {
    this.protect(0, length, at, lookAhead);
  }

  protect(from: number, to: number, at: (station: number) => OrbitPoint, lookAhead: number, padding = 0) {
    const step = 8;
    for (let station = from; station < to; station += step) {
      const start = at(station);
      this.insert(start, at(Math.min(to, station + step)), ORBIT_CLEARANCE + step / 2 + padding);
      const ahead = Math.min(to, station + lookAhead);
      if (ahead > station) this.insert(start, at(ahead), ORBIT_CLEARANCE + 5 + padding);
    }
  }

  protectSpan(start: OrbitPoint, end: OrbitPoint, padding = 0) {
    this.insert(start, end, ORBIT_CLEARANCE + 5 + padding);
  }

  private insert(start: OrbitPoint, end: OrbitPoint, radius: number) {
    const reach = radius + ORBIT_MAX_RADIUS;
    const bound = (axis: number, upper: boolean) => cellIndex(upper
      ? Math.max(start[axis], end[axis]) + reach : Math.min(start[axis], end[axis]) - reach);
    const capsule = { start, end, radius };
    this.capsules.push(capsule);
    for (let x = bound(0, false); x <= bound(0, true); x++) {
      for (let y = bound(1, false); y <= bound(1, true); y++) {
        for (let z = bound(2, false); z <= bound(2, true); z++) {
          const key = orbitCellKey(x, y, z);
          const items = this.cells.get(key);
          if (items) items.push(capsule);
          else this.cells.set(key, [capsule]);
        }
      }
    }
  }

  allows(key: string, position: OrbitPoint, radius: number) {
    return !this.cells.get(key)?.some(arc => segmentDistance(position, arc.start, arc.end) < radius + arc.radius);
  }

  /** Hero bodies can exceed the ordinary field's cell-index radius. */
  allowsSphere(position: OrbitPoint, radius: number) {
    if (radius <= ORBIT_MAX_RADIUS) return this.allows(orbitCellKey(...position.map(cellIndex) as [number, number, number]), position, radius);
    return !this.capsules.some(arc => segmentDistance(position, arc.start, arc.end) < radius + arc.radius);
  }
}

export class OrbitField {
  constructor(readonly seed: number, readonly density: OrbitDensity, private readonly clearance: OrbitClearance,
    private readonly beltAt: (z: number) => OrbitBelt) {}

  cell(x: number, y: number, z: number): OrbitRock[] {
    const key = orbitCellKey(x, y, z);
    const layout = orbitRandom(this.seed, x, y, z);
    const shape = this.beltAt(z);
    const dense = this.density === 'dense' ? 1 : this.density === 'sparse' ? 0 : shape.density;
    // A broken, inclined belt crosses the route. Independent lobes leave clear sky between clusters.
    const beltY = x * shape.tilt + shape.drift + Math.sin(z * .38) * .72;
    const belt = 1 / (1 + (Math.abs(y + .5 - beltY) * shape.width) ** 2);
    const hasAnchor = layout() < (.27 + belt * .47) * shape.coverage;
    const hasSecond = layout() < dense * (.11 + .83 * belt);
    const rocks: OrbitRock[] = [];
    for (let cluster = 0; cluster < 2; cluster++) {
      if (cluster === 0 ? !hasAnchor : !hasSecond) continue;
      const group = orbitRandom(this.seed, x, y, z, cluster + 1);
      const center = [.24 + group() * .52, .22 + group() * .56, .22 + group() * .56];
      const angle = group() * tau;
      const length = .13 + group() * .39;
      const count = (cluster === 0 ? 3 : 7) + Math.floor(group() * (cluster === 0 ? 4 : 12));
      for (let index = 0; index < count; index++) {
        const id = 2 + cluster * 32 + index;
        const random = orbitRandom(this.seed, x, y, z, id);
        const along = (random() * 2 - 1) * length;
        const across = (random() * 2 - 1) * length * .48;
        const local: OrbitPoint = [
          (center[0] + Math.cos(angle) * along - Math.sin(angle) * across) * ORBIT_CELL,
          (center[1] + (random() - .5) * length * .97 + along * .28) * ORBIT_CELL,
          (center[2] + Math.sin(angle) * along + Math.cos(angle) * across) * ORBIT_CELL,
        ];
        const size = index === 0 ? (cluster === 0 ? 8 + random() ** 1.85 * 25 : 4.5 + random() * 13)
          : .85 + random() ** 2.5 * (cluster === 0 ? 11 : 7.2);
        const prototype = Math.floor(random() * 4);
        const scale: OrbitPoint = [size * (.85 + random() * .35), size * (.51 + random() * .54), size * (.72 + random() * .48)];
        const radius = Math.max(...scale);
        if (local.some(value => value < radius || value > ORBIT_CELL - radius)) continue;
        const position: OrbitPoint = [x * ORBIT_CELL + local[0], y * ORBIT_CELL + local[1], z * ORBIT_CELL + local[2]];
        if (!this.clearance.allows(key, position, radius)) continue;
        if (rocks.some(other => Math.hypot(position[0] - other.position[0], position[1] - other.position[1],
          position[2] - other.position[2]) < (radius + other.radius) * 1.10)) continue;
        rocks.push({ id: `${key}:${id}`, cell: key, position, shape: prototype, scale, radius,
          rotation: [random() * tau, random() * tau, random() * tau], material: Math.floor(random() * 3),
          fragment: radius < 3.1, rank: random() });
      }
    }
    return rocks;
  }
}
