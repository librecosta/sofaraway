import { ringFragments } from './orbit-ring';
import type { PlayMode } from '../contracts';
import { orbitRandom } from './orbit-field';
import type { OrbitClearance, OrbitPoint, OrbitRock } from './orbit-field';
import { starwakeTrack } from './orbit-score';
import { modeScale } from './reference-track';
import type { Path } from '../graphics/path';

export const orbitSceneBeats = [8, 42, 96, 190, 237, 279, 346] as const;
export const orbitLandmarkBeats = [25, 66, 140, 190, 237, 279, 346] as const;
export const orbitSceneNames = ['Outer Boulder', 'Twin Asteroids', 'Shattered Ring', 'Spiral Debris Storm',
  'Celestial Occlusion', 'Nebula Veil', 'Into the Open Void'] as const;
export type CosmicKind = 'monolith' | 'fractures' | 'ring' | 'spiral' | 'eclipse' | 'nebula' | 'planet';
export interface CosmicBody {
  readonly id: string;
  readonly type: 'moon' | 'star' | 'planet';
  readonly position: OrbitPoint;
  readonly scale: OrbitPoint;
  readonly rotation: OrbitPoint;
  readonly radius: number;
}
export interface CosmicRock extends OrbitRock { readonly structure: string }
export interface NebulaStructure {
  readonly role: 'arc' | 'cliff' | 'pillars' | 'tendrils' | 'filaments' | 'nursery';
  readonly offset: OrbitPoint;
  readonly span: readonly [number,number];
  readonly angle: number;
}
export const nebulaStructures: readonly NebulaStructure[] = [
  {role:'arc',offset:[600,1100,6400],span:[14500,8200],angle:-.12},
  {role:'cliff',offset:[-2300,100,3900],span:[6900,6500],angle:.12},
  {role:'pillars',offset:[3100,-250,4700],span:[6300,6200],angle:-.24},
  {role:'tendrils',offset:[-300,-550,2800],span:[9400,5100],angle:.25},
  {role:'filaments',offset:[-1650,900,3300],span:[3100,1900],angle:-.38},
  {role:'nursery',offset:[2100,1350,5100],span:[2800,2300],angle:.18},
];
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
  readonly rocks: readonly CosmicRock[];
  readonly nebula: readonly NebulaStructure[];
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
    const anchor = frame.p.toArray(), rocks: CosmicRock[] = [], bodies: CosmicBody[] = [];
    const random = orbitRandom(seed, 0x534554, index);
    const body = (type: CosmicBody['type'], x: number, y: number, z: number, scale: OrbitPoint) => {
      let position = world(station, x, y, z);
      const radius = Math.max(...scale);
      // Preserve legibility of the route when placing large celestial bodies.
      let tries = 0;
      while (!clearance.allowsSphere(position, radius) && tries++ < 24) {
        x *= 1.12; y *= 1.08; position = world(station, x, y, z);
      }
      if (!clearance.allowsSphere(position, radius)) throw new Error(`Unsafe celestial body: ${id}`);
      bodies.push({ id: `${id}:${bodies.length}`, type, position, scale, radius, rotation: [0, 0, .18] });
      return bodies.at(-1)!;
    };
    const rock = (position: OrbitPoint, radius: number, index: number, structure = 'companions') => {
      if (!clearance.allowsSphere(position, radius)) return;
      rocks.push({ id: `${id}:${index}`, cell: id, position, radius, scale: [radius, radius * (.55 + random() * .4), radius * (.7 + random() * .3)],
        rotation: [random() * 6.28, random() * 6.28, random() * 6.28], shape: index % 4,
        structure, material: index % 3, rank: random(), fragment: radius < 3.5 });
    };
    const boulder = (x: number, y: number, z: number, scale: OrbitPoint, shape: number, material: number, structure: string) => {
      const position = world(station, x * size, y * size, z);
      const scaled: OrbitPoint = [scale[0] * size, scale[1] * size, scale[2] * size];
      const radius = Math.max(...scaled);
      if (!clearance.allowsSphere(position, radius)) return undefined;
      const entry: CosmicRock = {
        id: `${id}:boulder:${rocks.length}`, cell: id, position, scale: scaled, radius, shape, material, structure,
        rotation: [random() * .65 - .3, random() * .8 - .4, random() * .7 - .35], rank: 0, fragment: false,
      };
      rocks.push(entry);
      return entry;
    };

    if (id === 'monolith') boulder(195, 18, 45, [110, 94, 99], 0, 2, 'landmark-boulder');
    if (id === 'fractures') {
      boulder(-172, 55, 10, [100, 90, 94], 3, 2, 'landmark-boulder');
      boulder(164, -28, 40, [82, 73, 79], 2, 1, 'landmark-boulder');
    }
    if (id === 'monolith' || id === 'fractures') {
      for (const parent of [...rocks]) {
        for (let i = 0; i < 16; i++) {
          const azimuth = random() * Math.PI * 2;
          const elevation = random() * 2 - 1;
          const radius = (2 + random() ** 2 * 13) * size;
          const offset = parent.radius * (1.18 + random() * .74) + radius;
          const horizontal = Math.sqrt(1 - elevation * elevation) * offset;
          const position: OrbitPoint = [
            parent.position[0] + Math.cos(azimuth) * horizontal,
            parent.position[1] + elevation * offset,
            parent.position[2] + Math.sin(azimuth) * horizontal,
          ];
          if (rocks.some(other => other.structure === 'landmark-boulder'
            && Math.hypot(...position.map((value, axis) => value - other.position[axis])) < other.radius + radius)) continue;
          rock(position, radius, rocks.length);
        }
      }
    }
    if (id === 'ring') {
      // Keep the existing arcs, with a few larger irregular rocks on fracture shoulders.
      ringFragments(seed,(local,radius,structure)=>
        rock(world(station,local[0]*size,local[1]*size,local[2]*size),radius*size,rocks.length,structure));
      const shoulders = [
        [.66, 322, 24, 0], [2.73, 351, 33, 3], [5.20, 369, 19, 0],
      ] as const;
      const landmarks: CosmicRock[] = [];
      for (const [angle, offset, radius, shape] of shoulders) {
        const entry = boulder(Math.cos(angle) * offset, 217 + Math.sin(angle) * offset * .77, Math.sin(angle) * 110 * size,
          [radius, radius * .88, radius * .94], shape, shape % 3, 'ring-boulder');
        if (entry) landmarks.push(entry);
      }
      for (let i = rocks.length - landmarks.length - 1; i >= 0; i--) {
        const fragment = rocks[i];
        if (landmarks.some(parent => Math.hypot(...fragment.position.map((value, axis) => value - parent.position[axis]))
          < parent.radius + fragment.radius)) rocks.splice(i, 1);
      }
    }
    if (id === 'spiral') for (let i = 0; i < 2200; i++) {
      const t = random(), stream = i % 3;
      const s = stationAt(160 + t * 64);
      const angle = t * Math.PI * 3.3 + stream * 2.094 + (random() - .5) * .5;
      const braid=Math.max(0,Math.sin(t*19+stream*1.7));
      const radius = (65 + 65 * Math.sin(t * Math.PI) ** 2 + stream * 18 + (random() - .5) * (18+42*braid)+braid*21) * size;
      if (random() > Math.min(1, (1 - t) * 5)) continue;
      rock(world(s, Math.cos(angle) * radius, Math.sin(angle) * radius * .78, (random() - .5) * 65 * size),
        (1 + random() ** 3 * (i%31===0?28:15)) * size, i,'braided-stream');
    }
    if (id === 'eclipse') {
      for(let i=0;i<18;i++)rock(world(station,(-95-random()*170)*size,(random()-.5)*220*size,random()*330*size),(2+random()*13)*size,i,'backlit-shards');
      body('moon', 1250, 530, 3200, [880, 880, 880]);
      // Collinear from the chapter's inspection point: a real opaque occultation.
      body('star', 1250 * 1.86, 530 * 1.86, 3200 * 1.86, [1705, 1705, 1705]);
    }
    if (id === 'planet') body('planet', -4900, -1450, 9000, [3300, 3300, 3300]);
    // Keep the later scenes on their existing independent detail stream.
    const detail = orbitRandom(seed, 0x504c4154, index);
    if(id==='spiral') for(let stream=0;stream<3;stream++)for(let i=0;i<9;i++) {
      const t=.18+i*.067,angle=t*Math.PI*3.3+stream*2.094,r=(85+stream*18)*size;
      for(let j=0;j<5;j++)rock(world(stationAt(160+t*64),Math.cos(angle)*r+(detail()-.5)*22*size,
        Math.sin(angle)*r*.78+(detail()-.5)*17*size,(j-2)*10*size),(3+detail()*9)*size,rocks.length,'stream-knots');
    }
    if(id==='eclipse')for(let i=0;i<5;i++)rock(world(station,(-170-i*31)*size,(95-i*47)*size,(-45+i*39)*size),
      (11+detail()*12)*size,rocks.length,'rim-fragments');
    if(id==='planet') {
      body('moon',-1500,1100,7000,[240,240,240]);
      for(let i=0;i<12;i++)rock(world(station,(detail()-.5)*680*size,(130+detail()*150)*size,(detail()-.5)*500*size),
        (1+detail()*4)*size,rocks.length,'open-void-shards');
    }
    const from = stationAt(section.startBeat), to = id === 'planet' ? path.length + 10000 : stationAt(section.endBeat);
    const feather = Math.max(70, (stationAt(section.endBeat) - from) * (id === 'nebula' ? .28 : .18));
    return { id, section: section.name, name: orbitSceneNames[index], seed: seed ^ (index * 991), station,
      from: from - feather, to: to + feather, feather, anchor, right: frame.r.toArray(), up: frame.u.toArray(), forward: frame.f.toArray(),
      bodies, rocks, nebula: id==='nebula'?nebulaStructures:[], radius: id === 'planet' ? 14000 : id === 'eclipse' ? 8500 : id === 'nebula' ? 18000 : 1100 };
  });
}

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
export function cosmicPresence(piece: OrbitSetpiece, station: number) {
  return smooth((station - piece.from) / piece.feather) * smooth((piece.to - station) / piece.feather);
}
