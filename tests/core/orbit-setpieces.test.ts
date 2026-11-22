import { expect, test } from 'vitest';
import { makeOrbitSetpieces, cosmicPresence, orbitLandmarkBeats } from '../../app/game/core/orbit-setpieces';
import { OrbitClearance } from '../../app/game/core/orbit-field';
import { volumeById } from '../../app/game/core/volumes';
import { referenceFor } from '../../app/game/core/reference-track';
import { starwakeTrack } from '../../app/game/core/orbit-score';
import { buildRunPath } from '../../app/game/graphics/path';
import { BranchPath } from '../../app/game/graphics/branch-path';
import { orbitJunction } from '../../app/game/core/orbit-routes';
import { orbitClearance } from '../../app/game/graphics/orbit-world.client';
import { ringDensity, ringFragments } from '../../app/game/core/orbit-ring';

test('large bodies use their actual radius beyond the ordinary rock cell index', () => {
  const clearance=new OrbitClearance(2000,s=>[0,0,-s]);
  expect(clearance.allowsSphere([150,0,-1000],200)).toBe(false);
  expect(clearance.allowsSphere([250,0,-1000],200)).toBe(true);
});

for(const mode of ['standard','sightseeing'] as const) for(const difficulty of ['normal','impossible'] as const) {
  test(`seven world landmarks protect every actual route: ${mode}, ${difficulty}`,()=>{
    const volume=volumeById('orbit'),reference=referenceFor(volume,difficulty),path=buildRunPath(volume,mode,reference);
    const branch=new BranchPath(path,reference,mode,orbitJunction),clearance=orbitClearance(path,branch,mode);
    const a=makeOrbitSetpieces(path,mode,77345,clearance),b=makeOrbitSetpieces(path,mode,77345,clearance);
    expect(a).toEqual(b);
    expect(a.map(p=>p.section)).toEqual(starwakeTrack.sections.map(s=>s.name));
    for(const [i,piece] of a.entries()) {
      expect(piece.station).toBe(reference.station(orbitLandmarkBeats[i],mode));
      expect(piece.anchor).toEqual(path.sample(piece.station).p.toArray());
      for(const body of piece.bodies) expect(clearance.allowsSphere(body.position,body.radius),body.id).toBe(true);
      for(const rock of piece.rocks) expect(clearance.allowsSphere(rock.position,rock.radius),rock.id).toBe(true);
      let last=0;
      for(let station=piece.from-1;station<piece.from+piece.feather+1;station+=.5) {
        const value=cosmicPresence(piece,station);expect(value).toBeGreaterThanOrEqual(last-1e-8);
        expect(Math.abs(value-last)).toBeLessThan(.02);last=value;
      }
    }
    for (const [index, structure, count] of [[0, 'landmark-boulder', 1], [1, 'landmark-boulder', 2], [2, 'ring-boulder', 3]] as const) {
      const boulders = a[index].rocks.filter(rock => rock.structure === structure);
      expect(a[index].bodies).toHaveLength(0);
      expect(boulders).toHaveLength(count);
      for (const rock of boulders) {
        expect(rock.shape).toBeGreaterThanOrEqual(0);
        expect(rock.shape).toBeLessThan(4);
        expect(rock.radius).toBe(Math.max(...rock.scale));
        expect(Math.min(...rock.scale) / rock.radius).toBeGreaterThan(.83);
        expect(rock.rank).toBe(0);
      }
    }
    expect(a[5].nebula.map(n=>n.role)).toEqual(['arc','cliff','pillars','tendrils','filaments','nursery']);
    expect(a.find(p=>p.id==='ring')!.rocks.length).toBeGreaterThan(1200);
    expect(a.find(p=>p.id==='spiral')!.rocks.length).toBeGreaterThan(1500);
    expect(cosmicPresence(a.at(-1)!,reference.boostFinish(mode,difficulty==='impossible'?1.15:1))).toBe(1);
    expect(makeOrbitSetpieces(path,mode,1,clearance)[2].rocks).not.toEqual(a[2].rocks);
  },20000);
}

test('ring density has tapered torn edges, displaced ringlets and deterministic fracture fans',()=>{
  for(let layer=0;layer<5;layer++)for(let a=0;a<Math.PI*2;a+=.01)
    expect(Math.abs(ringDensity(a,layer)-ringDensity(a+.001,layer))).toBeLessThan(.025);
  expect(ringDensity(.46,0)).toBe(0);
  expect(ringDensity(.46+.20,0)).toBeGreaterThan(0);
  const sample=()=>{const entries:unknown[]=[];ringFragments(77345,(...v)=>entries.push(v));return entries;};
  expect(sample()).toEqual(sample());
  const structures=new Set<string>();ringFragments(77345,(_p,_r,role)=>structures.add(role));
  expect(structures.size).toBe(7);
});
