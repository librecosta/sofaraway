import type { PlayMode } from '../contracts';
import { orbitRandom } from './orbit-field';
import type { OrbitClearance, OrbitPoint, OrbitRock } from './orbit-field';
import { starwakeTrack } from './orbit-score';
import { modeScale } from './reference-track';
import type { Path } from '../graphics/path';

export const orbitSceneBeats = [8, 42, 96, 190, 237, 279, 346] as const;
export const orbitLandmarkBeats = [25, 66, 140, 190, 237, 279, 346] as const;
export const orbitSceneNames = ['Lonely Monolith', 'Twin Fractures', 'Shattered Ring', 'Spiral Debris Storm',
  'Celestial Occlusion', 'Nebula Veil', 'Into the Open Void'] as const;
export type CosmicKind = 'monolith' | 'fractures' | 'ring' | 'spiral' | 'eclipse' | 'nebula' | 'planet';
export interface CosmicBody {
  readonly id: string;
  readonly type: 'hero' | 'moon' | 'star' | 'planet';
  readonly position: OrbitPoint;
  readonly scale: OrbitPoint;
  readonly rotation: OrbitPoint;
  readonly radius: number;
  readonly shape: number;
}
export interface OrbitSetpiece {
  readonly id: CosmicKind;
  readonly section: string;
  readonly name: string;
  readonly seed: number;
  readonly station: number;
  readonly from: number;
  readonly to: number;
  readonly feather: number;
  readonly anchor: OrbitPoint;
  readonly right: OrbitPoint;
  readonly up: OrbitPoint;
  readonly forward: OrbitPoint;
  readonly bodies: readonly CosmicBody[];
  readonly rocks: readonly OrbitRock[];
  readonly radius: number;
}

/** Immutable world choreography. No musical playback time or quality enters generation. */
export function makeOrbitSetpieces(path: Path, mode: PlayMode, seed: number, clearance: OrbitClearance): OrbitSetpiece[] {
  const reference = path.reference!;
  const stationAt = (beat: number) => reference.station(beat, mode);
  const size = .6 + .4 * modeScale(mode);
  const scratch = path.sample(0);
  const world = (station: number, x = 0, y = 0, z = 0): OrbitPoint => {
    path.sample(station, scratch);
    return scratch.p.clone().addScaledVector(scratch.r, x).addScaledVector(scratch.u, y).addScaledVector(scratch.f, z).toArray();
  };
  const ids: CosmicKind[] = ['monolith', 'fractures', 'ring', 'spiral', 'eclipse', 'nebula', 'planet'];
  return starwakeTrack.sections.map((section, index) => {
    const id = ids[index], focus = orbitLandmarkBeats[index];
    const station = stationAt(focus), frame = path.sample(station);
    const anchor = frame.p.toArray(), rocks: OrbitRock[] = [], bodies: CosmicBody[] = [];
    const random = orbitRandom(seed, 0x534554, index);
    const body = (type: CosmicBody['type'], x: number, y: number, z: number, scale: OrbitPoint, shape = 0) => {
      let position = world(station, x, y, z);
      const radius = Math.max(...scale);
      // Move a hero outward as a whole, never clip its silhouette against the route.
      let tries = 0;
      while (!clearance.allowsSphere(position, radius) && tries++ < 24) {
        x *= 1.12; y *= 1.08; position = world(station, x, y, z);
      }
      if (!clearance.allowsSphere(position, radius)) throw new Error(`Unsafe celestial body: ${id}`);
      bodies.push({ id: `${id}:${bodies.length}`, type, position, scale, radius, shape,
        rotation: type === 'hero' ? [random() * .6, random() * 1.2, random() * .6 - .3] : [0, 0, .18] });
    };
    const rock = (position: OrbitPoint, radius: number, index: number) => {
      if (!clearance.allowsSphere(position, radius)) return;
      rocks.push({ id: `${id}:${index}`, cell: id, position, radius, scale: [radius, radius * (.55 + random() * .4), radius * (.7 + random() * .3)],
        rotation: [random() * 6.28, random() * 6.28, random() * 6.28], shape: index % 4,
        material: index % 3, rank: random(), fragment: radius < 3.5 });
    };
    if (id === 'monolith') body('hero', 195 * size, 18 * size, 45, [80 * size, 155 * size, 67 * size], 0);
    if (id === 'fractures') {
      body('hero', -168 * size, 55 * size, -25, [100 * size, 140 * size, 76 * size], 1);
      body('hero', 164 * size, -28 * size, 40, [105 * size, 118 * size, 90 * size], 2);
    }
    if (id === 'monolith' || id === 'fractures') for (let i = 0; i < 110; i++) {
      const side = id === 'monolith' || i % 2 ? 1 : -1;
      rock(world(station, side * (110 + random() * 175) * size, (random() - .5) * 330 * size, (random() - .5) * 370 * size),
        (1.2 + random() ** 3 * 13) * size, i);
    }
    if (id === 'ring') for (let i = 0; i < 2300; i++) {
      const angle = random() * Math.PI * 2;
      // Broken arcs, varying cross-section and detached sheets; never a solid torus.
      if (angle > .30 && angle < .62 || angle > 2.28 && angle < 2.62 || angle > 4.52 && angle < 4.77) continue;
      const width = 18 + 29 * (1 + Math.sin(angle * 3 + .7));
      const across = (random() + random() - 1) * width;
      const radius = (290 + across) * size;
      const height = Math.sin(angle) * (225 + across * .64) * size;
      const depth = (random() - .5) * (28 + width) * size + Math.sin(angle) * 110 * size;
      rock(world(station, Math.cos(angle) * radius, 217 * size + height, depth),
        (1.1 + random() ** 3.1 * 17) * size, i);
    }
    if (id === 'spiral') for (let i = 0; i < 2200; i++) {
      const t = random(), stream = i % 3;
      const s = stationAt(160 + t * 64);
      const angle = t * Math.PI * 3.3 + stream * 2.094 + (random() - .5) * .5;
      const radius = (65 + 65 * Math.sin(t * Math.PI) ** 2 + stream * 18 + (random() - .5) * 35) * size;
      if (random() > Math.min(1, (1 - t) * 5)) continue;
      rock(world(s, Math.cos(angle) * radius, Math.sin(angle) * radius * .78, (random() - .5) * 65 * size),
        (1 + random() ** 3 * 15) * size, i);
    }
    if (id === 'eclipse') {
      body('moon', 1250, 530, 3200, [880, 880, 880]);
      // Collinear from the chapter's inspection point: a real opaque occultation.
      body('star', 1250 * 1.86, 530 * 1.86, 3200 * 1.86, [1705, 1705, 1705]);
    }
    if (id === 'planet') body('planet', -4900, -1450, 9000, [3300, 3300, 3300]);
    const from = stationAt(section.startBeat), to = id === 'planet' ? path.length + 10000 : stationAt(section.endBeat);
    const feather = Math.max(70, (stationAt(section.endBeat) - from) * (id === 'nebula' ? .28 : .18));
    return { id, section: section.name, name: orbitSceneNames[index], seed: seed ^ (index * 991), station,
      from: from - feather, to: to + feather, feather, anchor, right: frame.r.toArray(), up: frame.u.toArray(), forward: frame.f.toArray(),
      bodies, rocks, radius: id === 'planet' ? 14000 : id === 'eclipse' ? 8500 : id === 'nebula' ? 18000 : 1100 };
  });
}

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
export function cosmicPresence(piece: OrbitSetpiece, station: number) {
  return smooth((station - piece.from) / piece.feather) * smooth((piece.to - station) / piece.feather);
}
