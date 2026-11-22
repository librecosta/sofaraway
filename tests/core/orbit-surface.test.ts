import { expect,test } from 'vitest';
import * as THREE from 'three';
import { stoneNoise,stoneVolume,OrbitRockSurface } from '../../app/game/graphics/orbit-rock-surface';
import { orbitHeroGeometry } from '../../app/game/graphics/orbit-geology';
import { heroGeology,heroSpall } from '../../app/game/graphics/orbit-geology';
import { heroRockVolume,OrbitHeroSurface } from '../../app/game/graphics/orbit-hero-surface';

test('baked gradient fields repeat continuously, have bounded values and are deterministic',()=>{
  expect(stoneVolume(8)).toEqual(stoneVolume(8));
  for(const period of [4,7,11])for(let i=0;i<40;i++) {
    const x=i*.137-.4,y=i*.29,z=i*.47;
    const n=stoneNoise(x,y,z,period,1207);
    expect(n).toBeGreaterThanOrEqual(0);expect(n).toBeLessThanOrEqual(1);
    expect(stoneNoise(x+period,y-period,z+period,period,1207)).toBeCloseTo(n,10);
    const slope=(t:number)=>(stoneNoise(t+.0001,y,z,period,1207)-stoneNoise(t-.0001,y,z,period,1207))/.0002;
    expect(Math.abs(slope(-.0001)-slope(.0001))).toBeLessThan(.001);
  }
});

test('hero joints and spalls are finite local structures, with distinct family masks',()=>{
  const signatures=[];
  for(let family=0;family<5;family++) {
    let joints=0,peels=0,spalls=0;const signature=[];
    for(let i=0;i<1200;i++) {
      const y=1-2*(i+.5)/1200,angle=i*2.399963229728653,r=Math.sqrt(1-y*y),x=r*Math.cos(angle),z=r*Math.sin(angle);
      const geology=heroGeology(family,x,y,z),spall=heroSpall(family,x,y,z);
      for(const value of Object.values(geology)) {expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1);}
      expect(spall).toBeGreaterThanOrEqual(0);expect(spall).toBeLessThanOrEqual(.044001);
      joints+=Number(geology.fault>.15);peels+=Number(geology.peel>.1);spalls+=Number(spall>.005);
      signature.push(geology.fault.toFixed(3),geology.peel.toFixed(3));
    }
    // Large quiet surfaces remain: detail must not become uniform wallpaper.
    expect(joints).toBeGreaterThan(2);expect(joints).toBeLessThan(180);
    expect(peels).toBeGreaterThan(5);expect(peels).toBeLessThan(240);
    expect(spalls).toBeGreaterThan(5);expect(spalls).toBeLessThan(160);
    signatures.push(signature.join(','));
  }
  expect(new Set(signatures).size).toBe(5);
});

test('hero fields share bounded baked data while owning and releasing separate GPU resources',()=>{
  expect(heroRockVolume(8)).toEqual(heroRockVolume(8));
  const a=new OrbitHeroSurface(),b=new OrbitHeroSurface(),ordinary=new OrbitRockSurface();
  expect(a.texture.image.data).toBe(b.texture.image.data);
  expect(a.texture.image.data).not.toBe(ordinary.texture.image.data);
  expect(a.texture.generateMipmaps).toBe(true);expect(a.texture.colorSpace).toBe(THREE.NoColorSpace);
  expect(a.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  let released=0;for(const surface of [a,b,ordinary]){surface.texture.addEventListener('dispose',()=>released++);surface.dispose();}
  expect(released).toBe(3);
});

test('hero cut faces retain finite attributes, valid triangles and explicit material structure',()=>{
  for(let shape=0;shape<5;shape++)for(const lod of [0,1]) {
    const geometry=orbitHeroGeometry(shape,lod),p=geometry.getAttribute('position'),index=geometry.getIndex()!;
    expect(index).toBeTruthy();
    for(const name of ['position','normal','heroCoord','heroFeatures','color'])
      expect([...geometry.getAttribute(name).array].every(Number.isFinite)).toBe(true);
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<index.count;i+=3){
      a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));
      expect(b.sub(a).cross(c.sub(a)).lengthSq()).toBeGreaterThan(1e-15);
    }
    geometry.dispose();
  }
});

test('world surfaces share immutable CPU texels, own GPU textures and identify geology families',()=>{
  const a=new OrbitRockSurface(),b=new OrbitRockSurface(),material=new THREE.MeshStandardMaterial();
  expect(a.texture.image.data).toBe(b.texture.image.data);
  expect(a.texture.image.width).toBe(64);expect(a.texture.colorSpace).toBe(THREE.NoColorSpace);
  expect(a.texture.generateMipmaps).toBe(true);expect(a.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  expect(a.texture.wrapR).toBe(THREE.RepeatWrapping);
  a.apply(material);
  for(let family=0;family<5;family++) {
    const geometry=orbitHeroGeometry(family,0);
    expect(new Set(geometry.getAttribute('rockFamily').array)).toEqual(new Set([family]));geometry.dispose();
  }
  let disposed=0;a.texture.addEventListener('dispose',()=>disposed++);b.texture.addEventListener('dispose',()=>disposed++);
  a.dispose();b.dispose();material.dispose();expect(disposed).toBe(2);
});
