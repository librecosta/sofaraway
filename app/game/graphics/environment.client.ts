import * as THREE from 'three';
import type { VolumeDefinition } from '../core/volumes';
import { mulberry } from './textures.client';

/* a cheap equirect environment so the metal hull has something to reflect */
export function makeEnvMap(r: THREE.WebGLRenderer) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0.00, '#05080c');
  grd.addColorStop(0.40, '#1b2833');
  grd.addColorStop(0.52, '#33475a');
  grd.addColorStop(1.00, '#030508');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);

  for (let i = 0; i < 10; i++) {
    const x = (i / 10) * 256 + 4;
    const lg = g.createLinearGradient(x, 0, x + 16, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(220,245,255,0.9)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(x, 44, 16, 14);
  }

  return prefilterEnvironment(r, new THREE.CanvasTexture(c));
}

/** Bakes a broad sky, cloud bounce and sunward lobe in world directions for the cabin metal. */
export function makeDaybreakEnvMap(renderer: THREE.WebGLRenderer, sun: THREE.Vector3) {
  const width = 128, height = 64;
  const pixels = new Uint8Array(width * height * 4);
  const cloud = new THREE.Color().setRGB(.19, .24, .32);
  const horizon = new THREE.Color().setRGB(.34, .46, .59);
  const zenith = new THREE.Color().setRGB(.13, .30, .55);
  const warm = new THREE.Color().setRGB(.92, .77, .53);
  const radiance = new THREE.Color();
  for (let y = 0; y < height; y++) {
    const elevation = Math.PI * ((y + .5) / height - .5);
    const vertical = Math.sin(elevation);
    const horizontal = Math.cos(elevation);
    const cloudBounce = THREE.MathUtils.smoothstep(-vertical, 0, .5);
    const blue = THREE.MathUtils.smoothstep(vertical, 0, .8);
    for (let x = 0; x < width; x++) {
      const azimuth = Math.PI * 2 * ((x + .5) / width - .5);
      const facing = horizontal * (Math.cos(azimuth) * sun.x + Math.sin(azimuth) * sun.z) + vertical * sun.y;
      const scatter = .74 * THREE.MathUtils.smoothstep(facing, .58, 1);
      radiance.copy(horizon).lerp(zenith, blue).lerp(cloud, cloudBounce).lerp(warm, scatter);
      const offset = (y * width + x) * 4;
      pixels[offset] = Math.round(radiance.r * 255);
      pixels[offset + 1] = Math.round(radiance.g * 255);
      pixels[offset + 2] = Math.round(radiance.b * 255);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return prefilterEnvironment(renderer, texture);
}

function prefilterEnvironment(renderer: THREE.WebGLRenderer, texture: THREE.Texture) {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    return pmrem.fromEquirectangular(texture);
  } finally {
    pmrem.dispose();
    texture.dispose();
  }
}
export function makeSky(volume: VolumeDefinition) {
  /* an open-topped corridor needs a sky behind it, not the clear colour */
  if (volume.topology === 'orbit') {
    // a sparse starfield, drawn once into an equirect strip
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = '#03060b';
    g.fillRect(0, 0, 1024, 512);
    const random = mulberry(volume.seed);
    for (let i = 0; i < 320; i++) {
      const x = random() * 1024, y = random() * 512;
      const r = random() ** 2 * 0.9 + 0.18;
      g.fillStyle = `rgba(${180 + random() * 75 | 0},${200 + random() * 55 | 0},255,${0.25 + random() * 0.7})`;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
    const stars = new THREE.CanvasTexture(c);
    stars.mapping = THREE.EquirectangularReflectionMapping;
    return stars;
  }

  return null;
}
