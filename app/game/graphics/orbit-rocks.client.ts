import * as THREE from 'three';
import { stoneNoise } from './orbit-surface-field';
import { OrbitRockSurface } from './orbit-rock-surface';
import { orbitRandom } from '../core/orbit-field';
import { orbitSpaceColor } from './orbit-sky.client';

export const ROCK_SHAPES = 4;
export const ROCK_LODS = 3;
const profiles = [[.96, .88, .86], [1, .56, .88], [.78, 1, .68], [.91, .80, 1]];
const vertex = new THREE.Vector3();

export function orbitRockGeometry(shape: number, lod: number) {
  const geometry = new THREE.IcosahedronGeometry(1, [2, 1, 0][lod]);
  const random = orbitRandom(1207, shape);
  const angles = Array.from({ length: 6 }, () => random() * 6.28);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const coordinates=new Float32Array(position.count*3),features=new Float32Array(position.count*4);
  const [a, b, c] = profiles[shape];
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const { x, y, z } = vertex;
    const broad = Math.sin(x * 3.6 + z * 2.8 + angles[0]) * Math.cos(y * 3.3 - z * 2 + angles[1]);
    const folds = Math.sin(x * 7 - y * 5 + z * 4 + angles[2]) * Math.cos(y * 7 + z * 6 + angles[3]);
    const ridge = Math.sin(x * 13 + y * 8 - z * 8 + angles[4]) * Math.sin(z * 12 - y * 9 + angles[5]);
    const radius = .88 + .18 * broad + .075 * folds + .028 * ridge;
    vertex.set(x * a + .10 * y * z, y * b + .12 * x * z, z * c + .14 * x * y);
    // Distinct fractured faces; the same bounded form is evaluated at each LOD.
    if(shape===0)vertex.z=Math.min(vertex.z,.54+.21*x-.1*y);
    else if(shape===1)vertex.y=Math.min(vertex.y,.30+.12*x-.08*z);
    else if(shape===2)vertex.x=Math.max(vertex.x,-.44+.16*y);
    else vertex.z-=.19*Math.exp(-((x-.22)**2*13+(y+.1)**2*16))*Math.max(0,z);
    vertex.multiplyScalar(radius).clampLength(0, .996);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    // Geometry retains its accepted silhouette. Surface color no longer repeats
    // the sinusoidal displacement phases; semantic masks are shared at all LODs.
    coordinates.set([x,y,z],i*3);
    const face=shape===0?z-(.54+.21*x-.1*y):shape===1?y-(.30+.12*x-.08*z):shape===2?(-.44+.16*y)-x:0;
    const fresh=Math.max(0,Math.min(1,face*12));
    const scar=shape===3?Math.exp(-((x-.22)**2*13+(y+.1)**2*16))*Math.max(0,z):0;
    const weather=stoneNoise(x*1.7+3,y*1.7+3,z*1.7+3,7,2391+shape*733);
    features.set([fresh,scar*.35,0,weather],i*4);
    const albedo=.80+.065*weather+.045*fresh;
    colors.set([albedo, albedo, albedo], i * 3);
  }
  geometry.setAttribute('heroCoord',new THREE.BufferAttribute(coordinates,3));
  geometry.setAttribute('heroFeatures',new THREE.BufferAttribute(features,4));
  geometry.setAttribute('rockFamily',new THREE.BufferAttribute(new Float32Array(position.count).fill([0,4,2,3][shape]),1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  // Give broad faces weight without hard, regular facets on every near triangle.
  if (lod === 0) {
    const normal = geometry.getAttribute('normal');
    const radial = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      radial.fromBufferAttribute(position, i).normalize();
      vertex.fromBufferAttribute(normal, i).lerp(radial, .26).normalize();
      normal.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
  }
  return geometry;
}

export class OrbitRocks {
  readonly surface=new OrbitRockSurface();
  readonly colors = [0x62676d, 0x62554b, 0x7b8082].map(color => new THREE.Color(color));
  readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, metalness: .04, fog: false });
  private readonly geometries = Array.from({ length: ROCK_SHAPES }, (_, shape) =>
    Array.from({ length: ROCK_LODS }, (_, lod) => orbitRockGeometry(shape, lod)));
  private readonly release = { value: 0 };
  private readonly mood = { value: 0 };

  constructor(visibleRange: number) {
    this.material.onBeforeCompile = shader => {
      shader.uniforms.orbitVisibleRange = { value: visibleRange };
      shader.uniforms.orbitRelease = this.release;
      shader.uniforms.orbitMood = this.mood;
      shader.fragmentShader = `uniform float orbitVisibleRange;\n${orbitSpaceColor}\n${shader.fragmentShader}`
        .replace('#include <opaque_fragment>', /* glsl */`
          float range = orbitVisibleRange * (1.0 - .38 * orbitRelease);
          float distanceBlend = smoothstep(range * .71, range, length(vViewPosition));
          outgoingLight = mix(outgoingLight, orbitSpaceColor(inverseTransformDirection(-vViewPosition, viewMatrix)), distanceBlend);
          // Reach zero contrast before subpixel instance rejection at .85 px.
          outgoingLight = mix(orbitSpaceColor(inverseTransformDirection(-vViewPosition,viewMatrix)),outgoingLight,smoothstep(.90,2.8,stoneCoverage));
          #include <opaque_fragment>`);
    };
    this.material.customProgramCacheKey=()=> 'orbit-field-rock-v2';
    this.surface.apply(this.material);
  }

  geometry(shape: number, lod: number) { return this.geometries[shape][lod]; }
  setRelease(value: number) { this.release.value = value; }
  setLighting(value:number){this.mood.value=value;}

  dispose() {
    for (const variants of this.geometries) for (const geometry of variants) geometry.dispose();
    this.material.dispose();this.surface.dispose();
  }
}
