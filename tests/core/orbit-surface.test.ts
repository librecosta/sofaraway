import { expect,test } from 'vitest';
import * as THREE from 'three';
import { stoneNoise,stoneVolume,OrbitRockSurface } from '../../app/game/graphics/orbit-rock-surface';
import { asteroidSurfaceVolume } from '../../app/game/graphics/orbit-surface-field';
import { asteroidLithologies } from '../../app/game/graphics/orbit-lithology';
import { orbitRockGeometry } from '../../app/game/graphics/orbit-rocks.client';

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

test('all scales share deterministic cellular data and release world-owned textures',()=>{
  expect(asteroidSurfaceVolume(8)).toEqual(asteroidSurfaceVolume(8));
  const a=new OrbitRockSurface(),b=new OrbitRockSurface();
  expect(a.asteroidTexture.image.data).toBe(b.asteroidTexture.image.data);
  expect(a.asteroidTexture.image.data).not.toBe(a.texture.image.data);
  expect(a.asteroidTexture.generateMipmaps).toBe(true);
  expect(a.asteroidTexture.colorSpace).toBe(THREE.NoColorSpace);
  expect(a.asteroidTexture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  let released=0;
  for(const surface of [a,b]) {
    surface.texture.addEventListener('dispose',()=>released++);
    surface.asteroidTexture.addEventListener('dispose',()=>released++);surface.dispose();
  }
  expect(released).toBe(4);
});

test('finite lithologies keep quiet surfaces, distinct structure and natural PBR ranges',()=>{
  expect(new Set(asteroidLithologies.map(p=>p.name)).size).toBe(4);
  for(const profile of asteroidLithologies) {
    for(const value of Object.values(profile).filter(v=>typeof v==='number'))expect(Number.isFinite(value)).toBe(true);
    expect(profile.fracture).toBeGreaterThan(0);expect(profile.fracture).toBeLessThan(1);
    expect(profile.roughness).toBeGreaterThanOrEqual(.85);expect(profile.roughness).toBeLessThan(1);
    expect(profile.albedo).toBeGreaterThan(.9);expect(profile.albedo).toBeLessThan(1.1);
  }
});

test('ordinary LODs supply the same surface contract without invalid attributes',()=>{
  for(let shape=0;shape<4;shape++)for(let lod=0;lod<3;lod++) {
    const geometry=orbitRockGeometry(shape,lod);
    for(const name of ['position','normal','color','heroCoord','heroFeatures','rockFamily']) {
      const attribute=geometry.getAttribute(name);
      expect(attribute.count).toBe(geometry.getAttribute('position').count);
      expect([...attribute.array].every(Number.isFinite)).toBe(true);
    }
    geometry.dispose();
  }
});

test('shared PBR hooks retain lighting, use one surface field and filter resolved detail',()=>{
  const surface=new OrbitRockSurface(),camera=new THREE.PerspectiveCamera(76,16/9,.1,680);
  surface.update(camera,540,'high');
  const materials=[new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial()];
  for(const material of materials) {
    material.onBeforeCompile=shader=>{shader.uniforms.existingLight={value:1};};
    surface.apply(material);
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <normal_fragment_maps>'};
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms,{} as THREE.WebGLRenderer);
    const uniforms=shader.uniforms as Record<string,{value:unknown}>;
    expect(uniforms.existingLight.value).toBe(1);
    expect(uniforms.asteroidField.value).toBe(surface.asteroidTexture);
    expect(uniforms.stoneDetail.value).toBe(2);
    expect(uniforms.stonePixels.value).toBeCloseTo(270*camera.projectionMatrix.elements[5]);
    expect(shader.vertexShader).toContain('modelMatrix*instanceMatrix');
    expect(shader.fragmentShader).toContain('textureGrad');
    expect(shader.fragmentShader).not.toMatch(/stoneBand|sin\(|atan\(/);
    surface.update(camera,540,'low');expect(uniforms.stoneDetail.value).toBe(0);
    surface.update(camera,540,'high');material.dispose();
  }
  surface.dispose();
});

test('world surfaces share immutable CPU texels, own GPU textures and identify geology families',()=>{
  const a=new OrbitRockSurface(),b=new OrbitRockSurface(),material=new THREE.MeshStandardMaterial();
  expect(a.texture.image.data).toBe(b.texture.image.data);
  expect(a.texture.image.width).toBe(64);expect(a.texture.colorSpace).toBe(THREE.NoColorSpace);
  expect(a.texture.generateMipmaps).toBe(true);expect(a.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  expect(a.texture.wrapR).toBe(THREE.RepeatWrapping);
  a.apply(material);
  let disposed=0;a.texture.addEventListener('dispose',()=>disposed++);b.texture.addEventListener('dispose',()=>disposed++);
  a.dispose();b.dispose();material.dispose();expect(disposed).toBe(2);
});

test('shared asteroid prototypes are deterministic, bounded and retain outward facets at every quality', () => {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let shape = 0; shape < 4; shape++) for (let lod = 0; lod < 3; lod++) {
    const geometry = orbitRockGeometry(shape, lod);
    const repeated = orbitRockGeometry(shape, lod);
    for (const [name, attribute] of Object.entries(geometry.attributes))
      expect(repeated.getAttribute(name).array).toEqual(attribute.array);
    const position = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      for (const point of [a, b, c]) expect(point.length()).toBeLessThanOrEqual(1);
      const face = b.sub(a).cross(c.sub(a));
      expect(face.lengthSq()).toBeGreaterThan(1e-10);
      expect(face.dot(a)).toBeGreaterThan(0);
      for (let corner = 0; corner < 3; corner++) {
        normal.fromBufferAttribute(normals, i + corner);
        expect(normal.length()).toBeCloseTo(1, 5);
        expect(normal.dot(face)).toBeGreaterThan(0);
      }
    }
    repeated.dispose();
    geometry.dispose();
  }
});
