import * as THREE from 'three';
import type { Path } from './path';
import { CLOUD_CLEARANCE, CLOUD_RELIEF, daybreakAtmosphere, DAYBREAK_MENU_BEAT } from './daybreak-atmosphere';
import { CLOUD_FIELD_PERIOD, CLOUD_FIELD_SIZE, makeDaybreakCloudField } from './daybreak-cloud-field';

let cloudPixels: Uint8Array | undefined;

function cloudField() {
  cloudPixels ??= makeDaybreakCloudField();
  const texture = new THREE.DataTexture(cloudPixels, CLOUD_FIELD_SIZE, CLOUD_FIELD_SIZE);
  texture.name = 'daybreak-cloud-surface-and-cirrus';
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
  readonly sunlight = new THREE.Color();
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
        colorScore: { value: new THREE.Vector4() },
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

          float cirrusWindow = smoothstep(.10, .24, height) * (1.0 - smoothstep(.67, .98, height));
          if (cirrusWindow > 0.0) {
            // Project a world direction onto the high sky, with no longitude seam or translation.
            vec2 axis = vec2(.82, .57236);
            vec2 wind = vec2(dot(ray.xz, axis), dot(ray.xz, vec2(-axis.y, axis.x)));
            vec2 cirrusUV = vec2(.34, .46) + wind * .52 / (height + .33);
            float filament = textureLod(cloudField, cirrusUV, mix(.90, .15, detail)).a;
            vec3 ice = mix(vec3(.67, .82, .91), vec3(.94, .91, .80), warm * towardsSun);
            sky = mix(sky, ice, filament * cirrusWindow * (.34 + .08 * detail) * (1.0 - .75 * glow));
          }

          const float period = ${CLOUD_FIELD_PERIOD.toFixed(1)};
          const float texel = period / ${CLOUD_FIELD_SIZE.toFixed(1)};
          float pitchFootprint = fwidth(ray.y);
          float directionFootprint = length(fwidth(ray.xz));
          if (ray.y < 0.0) {
            const float relief = ${CLOUD_RELIEF.toFixed(1)};
            float descent = -ray.y;
            float altitude = max(cameraPosition.y - seaLevel, relief * .5 + 1.0);
            float reach = altitude / max(descent, .0001);
            float visibility = 1.0 - smoothstep(140.0, mix(2300.0, 1800.0, veil), reach);
            if (visibility > 0.0) {
              vec2 world = cameraPosition.xz;
              // At grazing angles the footprint grows chiefly along the projected ray.
              float footprint = reach * (directionFootprint + pitchFootprint / descent);
              float lod = log2(max(1.0, (footprint * 1.8 + reach * .15) / texel));
              vec2 projected = (world + ray.xz * reach) / period;
              float surface = (textureLod(cloudField, projected, lod).r - .5) * relief;
              float correction = 1.0 - smoothstep(110.0, 540.0, reach);
              reach -= surface * correction / descent;
              projected = (world + ray.xz * reach) / period;
              vec3 cloud = textureLod(cloudField, projected, lod).rgb;
              float crown = smoothstep(.18, .82, cloud.r + (coverage - .64) * .23);
              vec2 slope = cloud.gb - .5;
              if (reach < 330.0) {
                vec3 swells = textureLod(cloudField, projected * 4.13 + vec2(.37, -.26), lod + mix(.95, .18, detail)).rgb;
                float nearDetail = 1.0 - smoothstep(75.0, 330.0, reach);
                slope += (swells.gb - .5) * (.52 * nearDetail);
                crown += (swells.r - .5) * (.46 * nearDetail * (.25 + .75 * crown));
              }
              float exposure = clamp(dot(slope, sun.xz) * 2.5, -.45, .45);
              float lit = clamp(.07 + .78 * crown + exposure * (.72 + .26 * warm), 0.0, 1.0);
              vec3 shadow = vec3(.45, .56, .70);
              vec3 crest = mix(vec3(.84, .90, .97), vec3(.98, .91, .81), warm * (.58 + exposure * .42));
              vec3 sea = mix(shadow, crest, lit);
              // Glancing rays lose their contrast to the same warm air as the sky.
              float grazing = smoothstep(.012, .085, descent);
              sky = mix(sky, sea, visibility * mix(.51, 1.0, grazing));
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

  update(beat: number, menu: boolean, daylight: number) {
    const [brightness, blue, warmth, haze, coverage] = daybreakAtmosphere(menu ? DAYBREAK_MENU_BEAT : beat, this.palette);
    const { uniforms } = this.mesh.material;
    uniforms.colorScore.value.set(brightness, blue, warmth, haze);
    uniforms.coverage.value = coverage;
    uniforms.daylight.value = daylight;
    this.air.setRGB(.56 + .12 * warmth, .69, .75 - .11 * warmth);
    this.sunlight.setRGB(.91 + .07 * warmth, .87 - .03 * warmth, .80 - .14 * warmth);
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
