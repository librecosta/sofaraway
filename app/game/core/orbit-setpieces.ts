import { Euler, Vector3 } from 'three';
import { ringFragments } from './orbit-ring';
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
        rotation: type === 'hero' ? [random() * .35, random() * .45 - .22, random() * .4 - .2] : [0, 0, .18] });
      return bodies.at(-1)!;
    };
    const rock = (position: OrbitPoint, radius: number, index: number, structure = 'companions') => {
      if (!clearance.allowsSphere(position, radius)) return;
      rocks.push({ id: `${id}:${index}`, cell: id, position, radius, scale: [radius, radius * (.55 + random() * .4), radius * (.7 + random() * .3)],
        rotation: [random() * 6.28, random() * 6.28, random() * 6.28], shape: index % 4,
        structure, material: index % 3, rank: random(), fragment: radius < 3.5 });
    };
    if (id === 'monolith') body('hero', 195 * size, 18 * size, 45, [80 * size, 155 * size, 67 * size], 0);
    if (id === 'fractures') {
      body('hero', -168 * size, 55 * size, -25, [100 * size, 140 * size, 76 * size], 1);
      body('hero', 164 * size, -28 * size, 40, [105 * size, 118 * size, 90 * size], 2);
    }
    if (id === 'monolith') body('hero', 273*size,-83*size,100,[48*size,58*size,50*size],3);
    if (id === 'fractures') body('hero', -245*size,135*size,75,[34*size,82*size,29*size],4);
    if (id === 'monolith' || id === 'fractures') {
      // Detached shelves and chips follow each parent's cleavage face and rotation.
      for(const parent of [...bodies]) {
        const rotation=new Euler(...parent.rotation),local=new Vector3();
        for(let i=0;i<43;i++) {
          const t=random(),side=parent.shape===1?-1:1;
          local.set(side*parent.scale[0]*(.72+t*.94),(random()-.5)*parent.scale[1]*1.2,
            parent.scale[2]*(.38+t*.9)+(random()-.5)*24*size).applyEuler(rotation);
          local.add(new Vector3(...parent.position));
          rock(local.toArray(),(2.2+random()**2*(1-t)*19)*size,rocks.length,'cleavage-fan');
        }
      }
    }
    if (id === 'ring') ringFragments(seed,(local,radius,structure)=>
      rock(world(station,local[0]*size,local[1]*size,local[2]*size),radius*size,rocks.length,structure));
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
    // Separate seeds preserve the established landmarks and companion layout.
    const detail = orbitRandom(seed, 0x504c4154, index);
    if(id==='monolith'||id==='fractures') for(const parent of [...bodies]) {
      const rotation=new Euler(...parent.rotation);
      for(let i=0;i<3;i++) {
        const side=parent.shape===1?-1:1;
        const offset=new Vector3(side*parent.scale[0]*(.64+i*.20),parent.scale[1]*(.42-i*.39),
          parent.scale[2]*(.42+i*.25)).applyEuler(rotation).add(new Vector3(...parent.position));
        const scale:OrbitPoint=[(22-i*3)*size,(43-i*6)*size,(11+i*2)*size];
        const radius=Math.max(...scale);
        if(!clearance.allowsSphere(offset.toArray(),radius))continue;
        bodies.push({id:`${id}:plate:${parent.id}:${i}`,type:'hero',position:offset.toArray(),scale,radius,shape:i===1?2:4,
          rotation:[parent.rotation[0]+.12*i,parent.rotation[1]+.24,parent.rotation[2]+side*.24]});
      }
    }
    if(id==='ring') {
      // Torn slabs follow the tangent at the three existing fracture mouths.
      for(const angle of [.62,2.64,4.85]) for(let i=0;i<3;i++) {
        const r=300+i*18,t=i*24;
        const position=world(station,(Math.cos(angle)*r-Math.sin(angle)*t)*size,
          (217+Math.sin(angle)*r*.77+Math.cos(angle)*t*.5)*size,(Math.sin(angle)*110+i*37)*size);
        const scale:OrbitPoint=[(20+i*7)*size,(39-i*5)*size,9*size],radius=Math.max(...scale);
        if(clearance.allowsSphere(position,radius))bodies.push({id:`ring:slab:${angle}:${i}`,type:'hero',position,scale,radius,shape:2,
          rotation:[.45+angle*.15,.35,angle-.5]});
      }
    }
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
