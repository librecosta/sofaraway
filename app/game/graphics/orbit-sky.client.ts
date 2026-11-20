import * as THREE from 'three';
import { orbitRandom } from '../core/orbit-field';

const skyVertex = /* glsl */`
varying vec3 direction;
void main() {
  direction = position;
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = clip.xyww;
}`;

export const orbitSpaceColor = /* glsl */`
uniform float orbitRelease;
vec3 orbitSpaceColor(vec3 ray) {
  float band = exp(-7.0 * pow(dot(ray, normalize(vec3(-.42, .83, .23))), 2.0));
  float key = smoothstep(-.33, .90, dot(ray, normalize(vec3(-.63, .39, -.65))));
  vec3 space = vec3(.009, .014, .023) + band * vec3(.009, .018, .032);
  space += band * key * vec3(.022, .008, .004);
  return space + orbitRelease * (vec3(.007, .014, .023) + band * vec3(.009, .017, .024));
}`;

const skyFragment = /* glsl */`
${orbitSpaceColor}
varying vec3 direction;
void main() {
  gl_FragColor = vec4(orbitSpaceColor(normalize(direction)), 1.0);
  #include <colorspace_fragment>
}`;

const starVertex = /* glsl */`
attribute float radius;
attribute float radiance;
attribute vec3 tint;
uniform float pixelRatio;
varying vec3 emission;
void main() {
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = clip.xyww;
  gl_PointSize = radius * pixelRatio;
  emission = tint * radiance;
}`;

const starFragment = /* glsl */`
varying vec3 emission;
void main() {
  vec2 p = (gl_PointCoord - .5) * 2.0;
  float light = exp(-4.3 * dot(p, p)) * (1.0 - smoothstep(.55, 1.0, length(p)));
  gl_FragColor = vec4(emission * light, 1.0);
}`;

export class OrbitSky {
  readonly group = new THREE.Group();
  private readonly dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.ShaderMaterial({
    vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { orbitRelease: { value: 0 } },
  }));
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(seed: number) {
    const random = orbitRandom(seed, 141);
    const count = 4100;
    const points = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const energy = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const band = new THREE.Quaternion().setFromEuler(new THREE.Euler(.23, 0, .46));
    const point = new THREE.Vector3();
    const warm = new THREE.Color(0xffd0a8);
    const cool = new THREE.Color(0xb8d5ff);
    const tint = new THREE.Color();
    const clusters = [new THREE.Vector3(-.42,.32,-1).normalize(), new THREE.Vector3(.70,-.23,-1).normalize(),
      new THREE.Vector3(.18,.65,.8).normalize(),new THREE.Vector3(-.8,-.3,.4).normalize()];
    for (let i = 0; i < count; i++) {
      const y = i < 2400 ? random() * 2 - 1 : (random() + random() - 1) * .28;
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      point.set(Math.cos(angle) * r, y, Math.sin(angle) * r).applyQuaternion(band).toArray(points, i * 3);
      if(i>=3600) {
        const spread=.018+random()**2*.16;
        point.copy(clusters[i%clusters.length]).add(new THREE.Vector3((random()-.5)*spread,(random()-.5)*spread,(random()-.5)*spread)).normalize().toArray(points,i*3);
      }
      const brilliance = random() ** 6;
      sizes[i] = 1.38 + 3.4 * brilliance;
      energy[i] = .078 + .91 * brilliance;
      tint.copy(warm).lerp(cool, random()).toArray(colors, i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    geometry.setAttribute('radius', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('radiance', new THREE.BufferAttribute(energy, 1));
    geometry.setAttribute('tint', new THREE.BufferAttribute(colors, 3));
    this.stars = new THREE.Points(geometry, new THREE.ShaderMaterial({ vertexShader: starVertex, fragmentShader: starFragment,
      uniforms: { pixelRatio: { value: 1 } }, depthWrite: false, toneMapped: false, transparent: true,
      blending: THREE.AdditiveBlending }));
    this.dome.renderOrder = -2;
    this.stars.renderOrder = -1;
    this.dome.frustumCulled = this.stars.frustumCulled = false;
    this.group.add(this.dome, this.stars);
  }

  resize(dpr: number) { this.stars.material.uniforms.pixelRatio.value = dpr; }
  setRelease(value: number) { this.dome.material.uniforms.orbitRelease.value = value; }

  dispose() {
    this.group.remove(this.dome, this.stars);
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
  }
}
