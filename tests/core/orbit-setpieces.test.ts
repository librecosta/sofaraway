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
import { orbitHeroGeometry } from '../../app/game/graphics/orbit-setpieces.client';

test('all hero LODs fit the declared unit-sphere bounds with finite surface normals',()=>{
  for(let shape=0;shape<3;shape++)for(let lod=0;lod<3;lod++) {
    const geometry=orbitHeroGeometry(shape,lod),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
    for(let i=0;i<p.count;i++) {
      expect(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))).toBeLessThanOrEqual(1.000001);
      expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,5);
    }
    geometry.dispose();
  }
});

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
    expect(a.find(p=>p.id==='ring')!.rocks.length).toBeGreaterThan(1200);
    expect(a.find(p=>p.id==='spiral')!.rocks.length).toBeGreaterThan(1500);
    expect(cosmicPresence(a.at(-1)!,reference.boostFinish(mode,difficulty==='impossible'?1.15:1))).toBe(1);
    expect(makeOrbitSetpieces(path,mode,1,clearance)[2].rocks).not.toEqual(a[2].rocks);
  },20000);
}
