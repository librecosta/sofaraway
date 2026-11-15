import * as THREE from 'three';
import type { Path } from './path';
import { CLOUD_CLEARANCE, CLOUD_RELIEF, daybreakAtmosphere, DAYBREAK_MENU_BEAT } from './daybreak-atmosphere';
import { mulberry } from './textures.client';

const fieldSize = 256;
let cloudPixels: Uint8Array | undefined;

function cloudField() {
  if (!cloudPixels) {
    const random = mulberry(0x271060);
    const octaves = [17, 43, 89, 137].map(cells => ({ cells, grid: Float32Array.from({ length: cells * cells }, random) }));
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const band = (x: number, y: number, index: number) => {
      const { cells, grid } = octaves[index];
      const u = x * cells / fieldSize, v = y * cells / fieldSize;
      const i = Math.floor(u), j = Math.floor(v);
      const a = grid[j * cells + i], b = grid[j * cells + (i + 1) % cells];
      const row = (j + 1) % cells * cells;
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, smooth(u - i)),
        THREE.MathUtils.lerp(grid[row + i], grid[row + (i + 1) % cells], smooth(u - i)), smooth(v - j));
    };
    const at = (x: number, y: number) => ((y + fieldSize) % fieldSize) * fieldSize + (x + fieldSize) % fieldSize;
    const height = new Float32Array(fieldSize * fieldSize);
    for (let y = 0; y < fieldSize; y++) for (let x = 0; x < fieldSize; x++) {
      const level = .55 * band(x, y, 0) + .30 * band(x, y, 1) + .15 * band(x, y, 2);
      height[at(x, y)] = THREE.MathUtils.smoothstep(level, .20, .81);
    }
    cloudPixels = new Uint8Array(height.length * 4);
    const byte = (level: number) => Math.round(255 * THREE.MathUtils.clamp(level, 0, 1));
    for (let y = 0; y < fieldSize; y++) for (let x = 0; x < fieldSize; x++) {
      const i = at(x, y), p = i * 4;
      cloudPixels[p] = byte(height[i]);
      cloudPixels[p + 1] = byte(.5 + .94 * (height[at(x - 1, y)] - height[at(x + 1, y)]));
      cloudPixels[p + 2] = byte(.5 + .94 * (height[at(x, y - 1)] - height[at(x, y + 1)]));
      cloudPixels[p + 3] = byte(band(x, y, 3));
    }
  }
  const texture = new THREE.DataTexture(cloudPixels, fieldSize, fieldSize);
  texture.name = 'daybreak-cloud-height-and-slope';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export class DaybreakExterior {
  readonly sun: THREE.Vector3;
  readonly seaLevel: number;
  readonly air = new THREE.Color();
  private readonly field = cloudField();
  private readonly palette = new Float32Array(5);
  readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;

  constructor(path: Path) {
    const heading = path.sample(path.length).f;
    this.sun = new THREE.Vector3(heading.x, 0, heading.z).normalize()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -.27);
    this.sun.y = .15;
    this.sun.normalize();
    this.seaLevel = path.frames.reduce((low, { p }) => Math.min(low, p.y), Infinity) - CLOUD_CLEARANCE;
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthTest: true, depthWrite: false, toneMapped: false,
      userData: { skipFocusDepth: true },
      uniforms: {
        cloudField: { value: this.field }, sun: { value: this.sun }, seaLevel: { value: this.seaLevel },
        drift: { value: new THREE.Vector2() }, colorScore: { value: new THREE.Vector4() },
        coverage: { value: 0 }, daylight: { value: 0 }, detail: { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec3 heading;
        void main() {
          heading = position;
          gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D cloudField;
        uniform vec3 sun;
        uniform vec2 drift;
        uniform vec4 colorScore;
        uniform float seaLevel, coverage, daylight, detail;
        varying vec3 heading;

        void main() {
          vec3 ray = normalize(heading);
          float height = max(ray.y, 0.0);
          float towardsSun = max(dot(ray, sun), 0.0);
          float warm = colorScore.z;
          float veil = colorScore.w;
          vec3 horizon = mix(vec3(.56, .69, .75), vec3(.75, .69, .58), warm * .64);
          horizon += vec3(.25, .16, .055) * (0.27 * towardsSun * towardsSun + .64 * smoothstep(.81, 1.0, towardsSun)) * warm;
          vec3 mid = mix(vec3(.24, .41, .67), vec3(.17, .46, .77), colorScore.y);
          vec3 zenith = mix(vec3(.09, .23, .49), vec3(.085, .27, .58), colorScore.y);
          vec3 blue = mix(mid, zenith, smoothstep(.28, .99, height));
          float air = exp2(-height * mix(14.0, 8.0, veil));
          vec3 sky = mix(blue, horizon, air);
          vec2 airBands = fract(vec2(dot(ray, vec3(1.4, 1.7, -.6)), dot(ray, vec3(-.8, 1.3, .9))));
          vec2 layers = 1.0 - 2.0 * smoothstep(vec2(0.0), vec2(1.0), abs(2.0 * airBands - 1.0));
          float scattering = layers.x * layers.y;
          sky += vec3(.024, .029, .033) * scattering * (1.0 - air) * (.6 + detail * .4);
          float glow = .45 * smoothstep(.941, 1.0, towardsSun) + .55 * smoothstep(.990, 1.0, towardsSun);
          sky += vec3(.36, .24, .11) * glow * warm;

          const float period = 12288.0;
          vec2 world = cameraPosition.xz + drift;
          vec3 shade = vec3(.35, .48, .61);
          vec3 crest = mix(vec3(.84, .89, .93), vec3(.96, .88, .75), warm * .75);
          float mist = 1.0 - smoothstep(.002, .078, abs(ray.y));
          if (mist > 0.0) {
            // Low-angle sightlines also pick up light scattered off the distant cloud banks.
            vec2 distant = (world + ray.xz * mix(1350.0, 630.0, mist)) / period;
            float bank = textureLod(cloudField, distant, 1.0).r;
            float density = smoothstep(.32, .76, bank) * mist * mist;
            sky = mix(sky, mix(shade, crest, smoothstep(.38, .84, bank)), density * .29);
          }

          if (ray.y < -.003) {
            float descent = -ray.y;
            float altitude = max(cameraPosition.y - seaLevel, 1.0);
            float reach = altitude / descent;
            // Sample a world-space cloud surface only where contrast survives the air column.
            float nearCloud = 1.0 - smoothstep(210.0, mix(3100.0, 2000.0, veil), reach);
            if (nearCloud > 0.0) {
              float lod = log2(max(1.0, reach * .002));
              vec2 projected = (world + ray.xz * reach) / period;
              vec4 cloud = textureLod(cloudField, projected, lod);
              if (detail > 0.0) {
                float surface = (cloud.r - .5) * ${CLOUD_RELIEF.toFixed(1)};
                projected = (world + ray.xz * (altitude - surface) / descent) / period;
                cloud = textureLod(cloudField, projected, lod);
              }
              vec4 smaller = textureLod(cloudField, projected * 5.17 + vec2(.31, .57), lod);
              float relief = dot(mix(cloud.gb, smaller.gb, .39) - .5, sun.xz);
              float cloudTop = mix(cloud.r, smaller.r, .37) + (coverage - .64) * .56;
              float top = smoothstep(.25, .74, cloudTop);
              float lit = clamp(.08 + top * .82 + relief * .72 + (smaller.a - .5) * .15 * detail, 0.0, 1.0);
              sky = mix(sky, mix(shade, crest, lit), nearCloud);
            }
          }
          vec3 exterior = sky * colorScore.x;
          gl_FragColor = vec4(mix(exterior, vec3(.96, .90, .81), daylight * .62), 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
    this.mesh.name = 'daybreak-exterior';
    this.mesh.renderOrder = 100;
    this.mesh.frustumCulled = false;
  }

  setDetail(detail: number) { this.mesh.material.uniforms.detail.value = detail; }

  update(beat: number, time: number, menu: boolean, daylight: number) {
    const [brightness, blue, warmth, haze, coverage] = daybreakAtmosphere(menu ? DAYBREAK_MENU_BEAT : beat, this.palette);
    const { uniforms } = this.mesh.material;
    uniforms.colorScore.value.set(brightness, blue, warmth, haze);
    uniforms.coverage.value = coverage;
    uniforms.daylight.value = daylight;
    uniforms.drift.value.set(time * .43, time * -.18);
    this.air.setRGB(.56 + .12 * warmth, .69, .75 - .11 * warmth);
    return brightness;
  }

  get daylight(): number { return this.mesh.material.uniforms.daylight.value; }

  get info() {
    return { seaLevel: this.seaLevel, sun: this.sun.toArray(), atmosphere: Array.from(this.palette),
      detail: this.mesh.material.uniforms.detail.value as number };
  }

  dispose() {
    this.field.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
