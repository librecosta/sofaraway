import { expect,test } from 'vitest';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { stoneNoise,stoneVolume,OrbitRockSurface } from '../../app/game/graphics/orbit-rock-surface';
import { asteroidSurfaceVolume } from '../../app/game/graphics/orbit-surface-field';
import { asteroidLithologies } from '../../app/game/graphics/orbit-lithology';
import { orbitRockGeometry } from '../../app/game/graphics/orbit-rocks.client';

// Complete RGBA texels captured from d02d57f, including non-power-of-two grids.
test.each([
  [1, 'b74de93f34b3e5321133e6cab702391ebeb3b0bc4d2ab0486638fb27d2fa2243', '28e1c2ed156054568d1b043364ec8a7f6a49029d24d064027f141120c494db1b'],
  [9, '5df223c3e80e16576943edab56b734bb2230559f126c311144da40069bb42ec0', '5e4bad03ed0f3bbc459da55fe0d4c4ca7664294718f616bba288e8d99fee9d23'],
  [32, '3fb454e0f1d190016138eff3321f7ff6fa4d83cca10e8bec34e5f92881a4932f', '28979c473f2825ede041d46a9e7b7d8a66af72790713e92f320857e90b17bfe4'],
  [63, '237552aea12874b126295ec95fc7742e7ca3bcaa30f88acf0661b43fdb5b2c48', '6f877aaaf8bbcd158c96047d67b87e0384c7e8238723db089c8aa253f20572c9'],
  [64, '43a31b8b3a8d4630801c1c04126f4748f9cdd8e6e12ea4e4602a8b1f7198a93d', 'b647a4a0404c7116730d3c6a09ddb65484e345e75a6d4165ca72b5f5a7e1cd0f'],
  [65, '581222b882185c81d95e423dbd9cf4f95df69a34ae3ca5effdf47da5fc23fc2b', 'a8a025f2da6a2458baf2828d13a688872bb5017831072e1e7825493cbb8ad683'],
] as const)('retains exact celestial and asteroid fields at size %i', (size, stone, asteroid) => {
  for (const [bake, expected] of [[stoneVolume, stone], [asteroidSurfaceVolume, asteroid]] as const) {
    const bytes = bake(size);
    expect(bytes).toHaveLength(size ** 3 * 4);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
  }
});

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
