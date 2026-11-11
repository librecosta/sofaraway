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

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(r);
  try {
    return pmrem.fromEquirectangular(tex);
  } finally {
    pmrem.dispose();
    tex.dispose();
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

  if (volume.topology === 'canal') {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.00, '#0b1a2c');
    grd.addColorStop(0.42, '#16374e');
    grd.addColorStop(0.62, '#1d4a63');
    grd.addColorStop(1.00, '#05090f');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 256);
    const sky = new THREE.CanvasTexture(c);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    return sky;
  }
  return null;
}
