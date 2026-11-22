import {expect,test,vi} from 'vitest';
import * as THREE from 'three';
import {orbitHeroGeometry,heroSolids,heroDomains} from '../../app/game/graphics/orbit-geology';

test.each(Array.from({length:15},(_,i)=>[Math.floor(i/3),i%3]))(
  'hero family %i LOD %i is deterministic, closed, connected and outward-oriented',(family,lod)=>{
    const geometry=orbitHeroGeometry(family,lod),index=geometry.getIndex()!,p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
    const edges=new Map<string,number>(),directions=new Map<string,number>(),parent=Array.from({length:p.count},(_,i)=>i);
    const root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]));
    let volume=0,minArea=Infinity,maxResidual=0;
    for(let i=0;i<p.count;i++) {
      expect(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))).toBeLessThan(1);
      expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,5);
      maxResidual=Math.max(maxResidual,Math.abs(heroSolids[family].distance(p.getX(i),p.getY(i),p.getZ(i))));
    }
    for(let i=0;i<index.count;i+=3) {
      const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
      for(const [u,v]of [[a,b],[b,c],[c,a]]) {
        const key=u<v?`${u}:${v}`:`${v}:${u}`;edges.set(key,(edges.get(key)??0)+1);directions.set(key,(directions.get(key)??0)+(u<v?1:-1));parent[root(u)]=root(v);
      }
      const ax=p.getX(a),ay=p.getY(a),az=p.getZ(a),bx=p.getX(b),by=p.getY(b),bz=p.getZ(b),cx=p.getX(c),cy=p.getY(c),cz=p.getZ(c);
      const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      minArea=Math.min(minArea,nx*nx+ny*ny+nz*nz);
      volume+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
    }
    expect(new Set(edges.values()),`family ${family} LOD ${lod}`).toEqual(new Set([2]));
    expect(new Set(directions.values())).toEqual(new Set([0]));
    expect(index.count/3).toBeLessThan(12000);
    expect(new Set(parent.map((_,i)=>root(i))).size,`family ${family} LOD ${lod}`).toBe(1);
    expect(minArea).toBeGreaterThan(1e-20);expect(volume).toBeGreaterThan(.01);expect(maxResidual).toBeLessThan(Math.hypot(...[0,1,2].map(i=>(heroDomains[family][i+3]-heroDomains[family][i])/[34,26,20][lod])));
    if(lod===0) {
      const repeated=orbitHeroGeometry(family,lod);
      for(const name of Object.keys(geometry.attributes))expect(repeated.getAttribute(name).array).toEqual(geometry.getAttribute(name).array);
      expect(repeated.index!.array).toEqual(index.array);repeated.dispose();
    }
    geometry.dispose();
});

/** Ray probes inspect the actual triangulated solid, with no shader masks. */
for(const lod of [0,1])test(`neutral LOD ${lod} contains fault depth, undercut thickness, a neck and an excavated crater`,()=>{
  const geometry=Array.from({length:5},(_,family)=>orbitHeroGeometry(family,lod));
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const surfaces=geometry.map(g=>new THREE.Mesh(g,material));
  const ray=(family:number,x:number,y:number)=>{
    const cast=new THREE.Raycaster(new THREE.Vector3(x,y,2),new THREE.Vector3(0,0,-1));
    return cast.intersectObject(surfaces[family]).map(hit=>hit.point.z).filter((z,i,all)=>!i||Math.abs(z-all[i-1])>.0001);
  };
  try {
    expect(ray(0,.0,.10)[0]).toBeLessThan(ray(0,.25,.10)[0]-.25);
    // An attached skin plate has a front, back, open recess and mother-rock wall.
    expect(ray(0,.25,-.32).length).toBeGreaterThanOrEqual(4);
    const width=(y:number)=>{
      const cast=new THREE.Raycaster(new THREE.Vector3(2,y,-.1),new THREE.Vector3(-1,0,0));
      const hits=cast.intersectObject(surfaces[1]);return hits[0].point.x-hits.at(-1)!.point.x;
    };
    expect(width(.40)).toBeGreaterThan(width(.0)*1.7);
    expect(ray(2,.0,.02)[0]).toBeGreaterThan(ray(2,.0,-.25)[0]+.15);
    expect(ray(3,.17,.13)[0]).toBeLessThan(ray(3,-.35,.13)[0]-.30);
    const box=geometry[4].boundingBox!;
    expect(box.max.y-box.min.y).toBeGreaterThan((box.max.x-box.min.x)*2.7);
  } finally{geometry.forEach(g=>g.dispose());material.dispose();}
});

test('cached solid data never shares mutable geometry buffers or GPU ownership across worlds',()=>{
  const first=orbitHeroGeometry(0,0),saved=first.getAttribute('position').getX(0);
  first.getAttribute('position').setX(0,123);first.userData.geology.regions.length=0;first.dispose();
  const second=orbitHeroGeometry(0,0);
  expect(second.getAttribute('position').getX(0)).toBe(saved);
  expect(second.userData.geology.regions.length).toBeGreaterThan(0);
  expect(second.uuid).not.toBe(first.uuid);second.dispose();
});

test('fresh initialization reproduces the same solids independently of the CPU cache',async()=>{
  const expected=Array.from({length:5},(_,family)=>orbitHeroGeometry(family,1));
  vi.resetModules();
  const {orbitHeroGeometry:fresh}=await import('../../app/game/graphics/orbit-geology');
  for(const [family,geometry]of expected.entries()) {
    const repeated=fresh(family,1);
    for(const name of Object.keys(geometry.attributes))expect(repeated.getAttribute(name).array).toEqual(geometry.getAttribute(name).array);
    expect(repeated.index!.array).toEqual(geometry.index!.array);
    repeated.dispose();geometry.dispose();
  }
});
