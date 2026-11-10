import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Deterministic pseudo-random
 * ------------------------------------------------------------------ */
export function mulberry(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 *  Convert a colour canvas into a tangent-space normal map
 * ------------------------------------------------------------------ */
function normalFromCanvas(src, strength = 2.4) {
  const s = src.width;
  const sctx = src.getContext('2d');
  const data = sctx.getImageData(0, 0, s, s).data;

  const h = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const o = i * 4;
    h[i] = (data[o] * 0.3 + data[o + 1] * 0.59 + data[o + 2] * 0.11) / 255;
  }

  const out = document.createElement('canvas');
  out.width = out.height = s;
  const octx = out.getContext('2d');
  const img = octx.createImageData(s, s);
  const d = img.data;

  const at = (x, y) => h[((y + s) % s) * s + ((x + s) % s)];

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * s + x) * 4;
      d[o]     = ((-dx / len) * 0.5 + 0.5) * 255;
      d[o + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      d[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function finish(canvas, repeatX, repeatY) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/* ------------------------------------------------------------------ *
 *  Hull plating: panels, greebles, hazard stripes, rivets
 * ------------------------------------------------------------------ */
export function makeHull() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = mulberry(9001);

  // base metal
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#2b3138');
  grad.addColorStop(1, '#1b1f24');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  // broad tonal variation
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.05 + R() * 0.07;
    g.fillStyle = R() > 0.5 ? '#495562' : '#0d1013';
    const w = 40 + R() * 200, h = 20 + R() * 160;
    g.fillRect(R() * S, R() * S, w, h);
  }
  g.globalAlpha = 1;

  // large panel plates
  const plate = (x, y, w, h, tone) => {
    g.fillStyle = tone;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(150,175,200,0.22)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y); g.lineTo(x + w, y); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.9)';
    g.lineWidth = 3;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };

  for (let i = 0; i < 14; i++) {
    const w = 110 + R() * 170;
    const h = 70 + R() * 140;
    const x = Math.floor(R() * (S - w));
    const y = Math.floor(R() * (S - h));
    const v = 44 + R() * 22;
    plate(x, y, w, h, `rgb(${v | 0},${(v + 7) | 0},${(v + 13) | 0})`);
  }

  // a few chunky greebles only
  for (let i = 0; i < 90; i++) {
    const w = 10 + R() * 40, h = 6 + R() * 22;
    const x = R() * S, y = R() * S;
    const v = 30 + R() * 40;
    g.fillStyle = `rgba(${v | 0},${(v + 5) | 0},${(v + 10) | 0},${0.6 + R() * 0.4})`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
  }

  // vertical ribs
  for (let i = 0; i < 4; i++) {
    const x = (i / 4) * S + 8;
    g.fillStyle = 'rgba(6,8,10,.8)';
    g.fillRect(x, 0, 6, S);
    g.fillStyle = 'rgba(170,195,220,.14)';
    g.fillRect(x + 6, 0, 2, S);
  }

  // hazard stripes
  for (let i = 0; i < 3; i++) {
    const x = R() * S, y = R() * S;
    const w = 44 + R() * 30, h = 16 + R() * 10;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = '#0d1013'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(190,150,30,.8)';
    for (let k = -h; k < w + h; k += 14) {
      g.beginPath();
      g.moveTo(x + k, y); g.lineTo(x + k + 7, y);
      g.lineTo(x + k + 7 + h, y + h); g.lineTo(x + k + h, y + h);
      g.closePath(); g.fill();
    }
    g.restore();
  }

  // rivets
  g.fillStyle = 'rgba(160,185,210,.35)';
  for (let i = 0; i < 320; i++) {
    const x = R() * S, y = R() * S;
    g.beginPath(); g.arc(x, y, 1.6, 0, 6.283); g.fill();
  }

  return { map: c, normal: normalFromCanvas(c, 3.2) };
}

/* ------------------------------------------------------------------ *
 *  Emissive strip pattern (bright bars on black)
 * ------------------------------------------------------------------ */
export function makeEmissive() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = mulberry(4242);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(255,255,255,${0.25 + R() * 0.75})`;
    g.fillRect(R() * S, R() * S, 2 + R() * 26, 1 + R() * 3);
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(255,255,255,${0.4 + R() * 0.6})`;
    g.fillRect(R() * S, R() * S, 1 + R() * 2, 6 + R() * 24);
  }
  return c;
}

/* ------------------------------------------------------------------ *
 *  Floor grating
 * ------------------------------------------------------------------ */
export function makeGrating() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0c0e'; g.fillRect(0, 0, S, S);

  const cell = 32;
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      g.fillStyle = '#2e353c';
      g.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      g.fillStyle = '#12161a';
      g.fillRect(x + 7, y + 7, cell - 14, cell - 14);
      g.strokeStyle = 'rgba(140,160,180,.22)';
      g.lineWidth = 1;
      g.strokeRect(x + 3.5, y + 3.5, cell - 7, cell - 7);
    }
  }
  // long bars
  for (let x = 0; x < S; x += cell) {
    g.fillStyle = 'rgba(90,105,120,.25)';
    g.fillRect(x, 0, 2, S);
  }
  return c;
}

/* ------------------------------------------------------------------ *
 *  Soft radial glow sprite
 * ------------------------------------------------------------------ */
export function makeGlow(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.65)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/* ------------------------------------------------------------------ *
 *  Package
 * ------------------------------------------------------------------ */
export function buildTextures() {
  const hull = makeHull();
  const hullMap = finish(hull.map, 1, 1);
  const hullNormal = finish(hull.normal, 1, 1);

  const grating = finish(makeGrating(), 1, 1);
  const emissive = finish(makeEmissive(), 1, 1);

  const glow = new THREE.CanvasTexture(makeGlow());
  glow.colorSpace = THREE.NoColorSpace;

  return { hullMap, hullNormal, grating, emissive, glow };
}
