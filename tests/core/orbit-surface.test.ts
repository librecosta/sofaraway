import { expect,test } from 'vitest';
import * as THREE from 'three';
import { stoneNoise,stoneVolume,OrbitRockSurface } from '../../app/game/graphics/orbit-rock-surface';
import { orbitHeroGeometry } from '../../app/game/graphics/orbit-geology';

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
