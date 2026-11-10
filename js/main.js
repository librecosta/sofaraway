import * as THREE from 'three';
import { buildTextures, mulberry } from './textures.js?v=2026-11-10za';
import { Tunnel, TUNNEL } from './tunnel.js?v=2026-11-10za';
import { buildPath } from './path.js?v=2026-11-10za';
import { Gates, lanePoint } from './gates.js?v=2026-11-10za';
import { PostFX } from './post.js?v=2026-11-10za';
import { AudioEngine } from './audio.js?v=2026-11-10za';
import { chartFor, DIFFICULTY, SONG_BEATS } from './chart.js?v=2026-11-10za';
import { VOL, VOLUMES, sectionAt } from './volumes.js?v=2026-11-10za';
import { Recorder } from './recorder.js?v=2026-11-10za';
import { QUALITY } from './quality.js?v=2026-11-10za';

const TOUCH = window.matchMedia('(pointer: coarse)').matches;

/* ------------------------------------------------------------------ *
 *  Boot flags
 * ------------------------------------------------------------------ */
const params = new URLSearchParams(location.search);
const fixedTime = parseFloat(params.get('t'));
const FIXED_T = Number.isFinite(fixedTime) && fixedTime >= 0
  ? Math.min(fixedTime, SONG_BEATS * 60 / VOL.bpm + 10) : null;
const AUTOPLAY = params.get('auto') === '1' || FIXED_T !== null;
const NO_POST = params.get('post') === '0';
const DBG = params.get('dbg') === '1';
const ALIGN = params.get('align') === '1';
const GOD = params.get('god') === '1' || (FIXED_T !== null && !params.has('god'));

/* ------------------------------------------------------------------ *
 *  Renderer
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('gl');
THREE.ColorManagement.enabled = false;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: QUALITY.antialias,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);

/* ------------------------------------------------------------------ *
 *  Scene
 * ------------------------------------------------------------------ */
const scene = new THREE.Scene();
const FOG_PLAY = 0x000000;
const fog = new THREE.FogExp2(FOG_PLAY, 0.0062);
scene.fog = fog;

/* a cheap equirect environment so the metal hull has something to reflect */
function makeEnvMap(r) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
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
  const rt = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return rt;
}
let environment = makeEnvMap(renderer);
scene.environment = environment.texture;

/* an open-topped corridor needs a sky behind it, not the clear colour */
if (VOL.topology === 'orbit') {
  // a sparse starfield, drawn once into an equirect strip
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#03060b';
  g.fillRect(0, 0, 1024, 512);
  const random = mulberry(VOL.seed);
  for (let i = 0; i < 320; i++) {
    const x = random() * 1024, y = random() * 512;
    const r = random() ** 2 * 0.9 + 0.18;
    g.fillStyle = `rgba(${180 + random() * 75 | 0},${200 + random() * 55 | 0},255,${0.25 + random() * 0.7})`;
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  }
  const stars = new THREE.CanvasTexture(c);
  stars.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = stars;
}

if (VOL.topology === 'canal') {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.00, '#0b1a2c');
  grd.addColorStop(0.42, '#16374e');
  grd.addColorStop(0.62, '#1d4a63');
  grd.addColorStop(1.00, '#05090f');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const sky = new THREE.CanvasTexture(c);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;
}

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 420);
camera.position.set(0, 0, 0);

const tex = buildTextures();

/* the corridor is a curve: straights joined by quarter turns */
const CRUISE_SPEED = 24;
const MAX_SPEED_BONUS = 10;
const BOOST_MULTIPLIER = 1.45;
/* long enough to still have corridor under you at full boost for the whole song */
const PATH_BACK = 4200;          // corridor generated behind the start, for the reel-back
const START_S = PATH_BACK;
const MENU_S = START_S + 140;   // title screen lives here, always
const CORRIDOR_LEN = START_S + SONG_BEATS * 60 / VOL.bpm
  * (CRUISE_SPEED + MAX_SPEED_BONUS) * BOOST_MULTIPLIER + 650;
const path = buildPath(CORRIDOR_LEN, 150, 46, VOL.topology);
const tunnel = new Tunnel(tex, path);
scene.add(tunnel.group);

const gates = new Gates(scene);
const _gp = { p: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3() };
const _gt = new THREE.Vector3();
gates.place = (mesh, dist) => {
  path.sample(G.distance + dist, _gp);
  mesh.position.copy(_gp.p);
  mesh.up.copy(_gp.u);
  _gt.copy(_gp.p).sub(_gp.f);
  mesh.lookAt(_gt);
};
const _camF = { p: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3() };
const _camTgt = new THREE.Vector3();
const _negF = new THREE.Vector3();
const rec = new Recorder();
const frameTimes = [];
let droppedRes = false;
if (params.get('rec') === '1') rec.toggle();
const _basis = new THREE.Matrix4();
const post = new PostFX(renderer);
if (params.has('dof')) {
  const [ap, mb] = params.get('dof').split(',').map(Number);
  post.dofMat.uniforms.uAperture.value = ap;
  if (!Number.isNaN(mb)) post.dofMat.uniforms.uMaxBlur.value = mb;
}

/* ------------------------------------------------------------------ *
 *  Wireframe mode (menu) — the signature look of the original
 * ------------------------------------------------------------------ */
const wireMat = null;
void wireMat;
let wireframe = false;
function setWireframe(on) {
  if (wireframe === on) return;
  wireframe = on;
  fog.color.setHex(on ? 0xffffff : FOG_PLAY);
  renderer.setClearColor(on ? 0xffffff : 0x000000, 1);
  document.body.classList.toggle('wires', on);
  tunnel.setWireframe(on);
  for (const g of gates.list) for (const mm of g.meshes) mm.visible = !on;
}


/* ------------------------------------------------------------------ *
 *  Audio
 * ------------------------------------------------------------------ */
const audio = new AudioEngine(VOL.bpm);
const BPM = VOL.bpm;
const SEC_PER_BEAT = 60 / BPM;

/* ------------------------------------------------------------------ *
 *  Game state
 * ------------------------------------------------------------------ */
const State = { MENU: 'menu', PLAY: 'play', CRASH: 'crash', OVER: 'over' };

const DIFF_KEYS = ['easy', 'normal', 'hard'];
let difficulty = localStorage.getItem('sofaraway.difficulty') || 'normal';
if (!DIFFICULTY[difficulty]) difficulty = 'normal';

const G = {
  state: State.MENU,
  time: 0,
  beat: 0,
  beatLocal: 0,
  distance: 0,
  speed: 24,
  score: 0,
  best: parseInt(localStorage.getItem('sofaraway.best') || '0', 10),
  combo: 0,
  maxCombo: 0,
  gatesPassed: 0,
  gatesJudged: 0,
  gatesTotal: 0,
  hits: 0,
  lives: 2,
  maxLives: 2,
  invulnUntil: 0,
  boosting: false,
  runOver: false,
  chart: [],
  chartIndex: 0,
  menuT: 0,
  recoil: 0,
  settleAt: 0,
  shake: 0,
  hitFlash: 0,
};

G.distance = MENU_S;

const PHASES = VOL.hue;
const PHASE_BEATS = 32;
const SPAWN_LOOKAHEAD = 9;   // beats of warning before a gate arrives

let currentHue = PHASES[0];
let startingAudio = null;
let contextLost = false;
let disposed = false;

const CAM = { x: 0, y: 0, tx: 0, ty: 0, roll: 0 };
/* The section is an octagon, not a box: |x| <= a and |y| <= b are not enough,
   the chamfer is the line |x| + |y| = a + b - ch. Clamp against all three or the
   camera ends up outside the hull on a corner and the wall clips away. */
function clampSection(x, y, margin) {
  const ax = TUNNEL.a - margin;
  const ay = TUNNEL.b - margin;
  const diag = TUNNEL.a + TUNNEL.b - TUNNEL.ch - margin * 1.9;
  let px = THREE.MathUtils.clamp(x, -ax, ax);
  let py = THREE.MathUtils.clamp(y, -ay, ay);
  const d = Math.abs(px) + Math.abs(py);
  if (d > diag && d > 1e-4) {
    const k = diag / d;
    px *= k; py *= k;
  }
  return [px, py];
}

const RANGE_X = TUNNEL.a - 0.32;
const RANGE_Y = TUNNEL.b - 0.32;
/* the camera trails the vessel instead of sitting on it, so the marker you
   steer is visibly *off-centre* — first person, but not glued to the axis */
const CAM_OFFSET = 0.88;
const CAM_LIMIT_X = TUNNEL.a - 0.18;   // effectively free; only stops a hard scrape
const CAM_LIMIT_Y = TUNNEL.b - 0.18;
const _v3 = new THREE.Vector3();

/* ------------------------------------------------------------------ *
 *  DOM
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
if (params.get('ui') === '0') $('ui').style.display = 'none';
const elMenu = $('menu'), elHud = $('hud'), elOver = $('over');
const elScore = $('hud-score');
const elSpeed = $('hud-speed'), elCombo = $('hud-combo');
const elMsg = $('center-msg');
const elCursor = $('cursor');
const elFlash = $('flash'), elPanel = $('panel');
const elOverScore = $('over-score');
const settings = $('settings');
if (TOUCH) $('hint').querySelector('b').style.display = 'none';

function show(el, on) { el.classList.toggle('hidden', !on); }

function setState(s) {
  G.state = s;
  show(elMenu, s === State.MENU);
  show(elHud, s === State.PLAY);
  show(elOver, s === State.OVER);
  setWireframe(false);   // the menu now sits over the lit corridor, no x-ray mode
}

let flashFrame = 0;
function flash(amount = 0.8, ms = 220, color = '#ffffff') {
  cancelAnimationFrame(flashFrame);
  elFlash.style.background = color;
  elFlash.style.opacity = String(amount);
  elFlash.style.transition = 'none';
  flashFrame = requestAnimationFrame(() => {
    elFlash.style.transition = `opacity ${ms}ms ease-out`;
    elFlash.style.opacity = '0';
  });
}

let msgTimer = 0;
function message(text, secs = 0.9) {
  elMsg.textContent = text;
  elMsg.classList.add('show');
  msgTimer = secs;
}

/* ------------------------------------------------------------------ *
 *  Custom cursor — always visible, never the OS pointer
 * ------------------------------------------------------------------ */
const PTR = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

function paintCursor(x, y) {
  elCursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}
paintCursor(window.innerWidth / 2, window.innerHeight / 2);
if (params.has('cur')) {
  const [cx, cy] = params.get('cur').split(',').map(Number);
  PTR.x = cx; PTR.y = cy;
}

window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  PTR.x = e.clientX; PTR.y = e.clientY;
  elCursor.classList.remove('hidden');
}, { passive: true });

window.addEventListener('pointerover', (e) => {
  const t = e.target;
  const hit = t && t.closest ? t.closest('[data-act]') : null;
  elCursor.classList.toggle('hover', !!hit);
}, true);

document.addEventListener('pointerleave', () => elCursor.classList.add('hidden'));
document.addEventListener('pointerenter', () => elCursor.classList.remove('hidden'));

/* ------------------------------------------------------------------ *
 *  Input
 * ------------------------------------------------------------------ */
let boostPointer = null;

/* On a coarse pointer the finger hides what it is aiming at, so the reticle is
   driven by how far the finger has travelled since it went down, and drawn a
   little above it. Absolute mapping would also force the thumb to the screen
   edge to reach the edge of the corridor. */
let touchLast = null;
let touchPointer = null;
const TOUCH_LIFT = 64;

function pointerToTarget(cx, cy) {
  const nx = (cx / window.innerWidth) * 2 - 1;
  const ny = (cy / window.innerHeight) * 2 - 1;
  const [tx, ty] = clampSection(
    THREE.MathUtils.clamp(nx, -1, 1) * RANGE_X,
    THREE.MathUtils.clamp(-ny, -1, 1) * RANGE_Y,
    0.34,
  );
  CAM.tx = tx;
  CAM.ty = ty;
}

window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  pointerToTarget(e.clientX, e.clientY);
}, { passive: true });

function touchSteer(cx, cy) {
  const kx = (RANGE_X * 2) / (window.innerWidth * 0.62);
  const ky = (RANGE_Y * 2) / (window.innerHeight * 0.62);
  const [nx2, ny2] = clampSection(
    CAM.tx + (cx - touchLast.x) * kx,
    CAM.ty - (cy - touchLast.y) * ky,
    0.34,
  );
  CAM.tx = nx2;
  CAM.ty = ny2;
  touchLast = { x: cx, y: cy };
  // the reticle rides above the thumb so the barrier stays visible
  PTR.x = window.innerWidth * 0.5 + (CAM.tx / RANGE_X) * window.innerWidth * 0.31;
  PTR.y = window.innerHeight * 0.5 - (CAM.ty / RANGE_Y) * window.innerHeight * 0.31 - TOUCH_LIFT;
}

canvas.addEventListener('pointerdown', (e) => {
  if (G.state !== State.PLAY || !e.isPrimary || e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  elCursor.classList.add('down');
  if (e.pointerType === 'touch') {
    touchPointer = e.pointerId;
    touchLast = { x: e.clientX, y: e.clientY };
  } else {
    boostPointer = e.pointerId;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === touchPointer) touchSteer(e.clientX, e.clientY);
});
function releasePointer(e) {
  if (e.pointerId === boostPointer) boostPointer = null;
  if (e.pointerId === touchPointer) {
    touchPointer = null;
    touchLast = null;
  }
  elCursor.classList.remove('down');
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(event, releasePointer);
}

const keys = new Set();
function clearInput() {
  const captured = [boostPointer, touchPointer];
  boostPointer = touchPointer = touchLast = null;
  for (const id of captured) {
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  keys.clear();
  G.boosting = false;
  elCursor.classList.remove('down');
}
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  const modal = [settings, elPanel].find(el => !el.classList.contains('hidden'));
  if (modal) {
    if (k === 'escape') show(modal, false);
    return;
  }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();

  if ((k === ' ' || k === 'enter') && !e.repeat) {
    if (k === 'enter' && e.target.closest?.('button')) return;
    if (G.state === State.MENU) startGame();
    else if (G.state === State.OVER) startGame();
  }
  if (k === 'escape') {
    if (G.state !== State.MENU) toMenu();
  }
  if (k === 'r') {
    if (e.shiftKey) rec.download();
    else rec.toggle();
  }
  if (G.state === State.MENU && (k === 'arrowleft' || k === 'arrowright')) {
    stepVolume(k === 'arrowright' ? 1 : -1);
    return;
  }
  if (k === 'm' && !e.repeat) { audio.setMuted(!audio.muted); message(audio.muted ? 'MUTED' : 'SOUND ON', 0.8); }
  if (G.state === State.PLAY) keys.add(k);
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
});
window.addEventListener('blur', clearInput);
window.addEventListener('contextmenu', (e) => e.preventDefault());

function readKeyboard(dt) {
  let ax = 0, ay = 0;
  if (keys.has('arrowleft') || keys.has('a')) ax -= 1;
  if (keys.has('arrowright') || keys.has('d')) ax += 1;
  if (keys.has('arrowup') || keys.has('w')) ay += 1;
  if (keys.has('arrowdown') || keys.has('s')) ay -= 1;
  if (ax || ay) {
    const sp = 6.2;
    [CAM.tx, CAM.ty] = clampSection(CAM.tx + ax * sp * dt, CAM.ty + ay * sp * dt, 0.34);
    PTR.x = (CAM.tx / RANGE_X + 1) * window.innerWidth / 2;
    PTR.y = (1 - CAM.ty / RANGE_Y) * window.innerHeight / 2;
  }
}

/* ------------------------------------------------------------------ *
 *  Flow
 * ------------------------------------------------------------------ */
function resetRun() {
  clearRunEffects();
  const d = DIFFICULTY[difficulty];
  G.chart = chartFor(difficulty, d.seed);
  G.chartIndex = 0;
  G.gatesTotal = G.chart.length;
  G.maxLives = d.lives;
  G.lives = d.lives;
  G.distance = START_S;
  G.speed = CRUISE_SPEED;
  G.score = 0;
  G.combo = 0;
  G.maxCombo = 0;
  G.gatesPassed = 0;
  G.gatesJudged = 0;
  G.hits = 0;
  G.invulnUntil = 0;
  G.runOver = false;
  G.boosting = false;
  G.time = 0;
  G.beat = 0;
  G.beatLocal = 0;
  G.recoil = 0;
  G.shake = 0;
  G.hitFlash = 0;
  currentHue = PHASES[0];
  CAM.x = CAM.tx = 0;
  CAM.y = CAM.ty = 0;
  CAM.roll = 0;
  updateHud();
}

async function startGame(withAudio = true) {
  if (G.state !== State.MENU && G.state !== State.OVER) return;
  gates.clear();
  resetRun();
  setState(State.PLAY);
  flash(0.9, 260);
  if (withAudio && FIXED_T === null) {
    const pending = audio.start();
    startingAudio = pending;
    try {
      if (await pending && startingAudio === pending && (document.hidden || contextLost)) {
        pauseForSurface(true);
      }
    } catch (error) {
      console.warn('Audio unavailable for this run', error);
    } finally {
      if (startingAudio === pending) startingAudio = null;
    }
  }
}

function clearRunEffects() {
  clearInput();
  cancelAnimationFrame(flashFrame);
  clearTimeout(shakeTimer);
  document.body.style.transform = '';
  elFlash.style.opacity = '0';
  elMsg.classList.remove('show');
  elCursor.classList.remove('lock');
  msgTimer = 0;
}

function toMenu() {
  startingAudio = null;
  clearRunEffects();
  gates.clear();
  G.distance = MENU_S;          // the menu never inherits where the run ended
  setState(State.MENU);
  audio.stop();
  G.time = 0;
  G.beatLocal = 0;
}

/* a hit costs a life; the run is only over when the last one goes */
function takeHit(gate) {
  G.lives--;
  G.combo = 0;
  G.hits++;
  G.invulnUntil = gate.beat + 1.4 / SEC_PER_BEAT;
  G.shake = 1.0;
  G.hitFlash = 1.0;
  if (gate) gate.hit = 1;

  flash(0.9, 380, '#ff5a5a');
  shakeDom(1);

  if (G.lives <= 0) endRun('TERMINATED');
}

function endRun(title) {
  if (G.runOver) return;
  G.runOver = true;
  G.state = State.CRASH;
  G.settleAt = G.time + 0.7;
  G.recoil = title === 'ESCAPED' ? 0 : 0.55;
  G.resultTitle = title;
  clearInput();
  audio.stop();
}

function settleRun() {
  const acc = G.gatesJudged > 0 ? G.gatesPassed / G.gatesJudged : 0;

  let rank = 'C';
  if (G.lives > 0) {
    if (acc >= 0.985) rank = 'S';
    else if (acc >= 0.93) rank = 'A';
    else if (acc >= 0.82) rank = 'B';
  } else if (acc >= 0.93) {
    rank = 'B';
  }

  setState(State.OVER);

  elFlash.style.transition = 'opacity 900ms ease-out';
  elFlash.style.opacity = '0';

  $('over-title').textContent = G.resultTitle;
  elOverScore.textContent = String(Math.floor(G.score));
  $('over-rank').textContent = rank;
  $('over-gates').textContent = `${G.gatesPassed}/${G.gatesTotal}`;
  $('over-combo').textContent = String(G.maxCombo);
  $('over-acc').textContent = Math.round(acc * 100) + '%';

  if (FIXED_T === null && G.score > G.best) {
    G.best = Math.floor(G.score);
    localStorage.setItem('sofaraway.best', String(G.best));
  }
}

let shakeTimer = 0;
function shakeDom(amount) {
  if (FIXED_T !== null) return;
  clearTimeout(shakeTimer);
  document.body.style.transform = `translate(${(Math.random() - 0.5) * 22 * amount}px, ${(Math.random() - 0.5) * 22 * amount}px)`;
  shakeTimer = setTimeout(() => { document.body.style.transform = ''; }, 90);
}

/* ------------------------------------------------------------------ *
 *  HUD
 * ------------------------------------------------------------------ */
function updateHud() {
  elScore.textContent = String(Math.floor(G.score));
  $('hud-gates').textContent = G.gatesPassed + '/' + G.gatesTotal;
  elCombo.textContent = '×' + G.combo;
  const p = THREE.MathUtils.clamp((G.speed - 24) / 34, 0, 1) * 100;
  elSpeed.style.width = p + '%';

  const bars = $('hud-lives').children;
  for (let i = 0; i < bars.length; i++) {
    bars[i].classList.toggle('on', i < G.lives);
    bars[i].style.display = i < G.maxLives ? '' : 'none';
  }

  $('hud-boost').classList.toggle('on', G.boosting && G.state === State.PLAY);
  $('hint').classList.toggle('show', G.state === State.PLAY && G.beat < 15);

  $('hud-section').textContent = sectionAt(G.beat)?.name ?? VOL.sections.at(-1).name;
}

/* ------------------------------------------------------------------ *
 *  Simulation
 * ------------------------------------------------------------------ */
function placeCamera() {
  path.sample(G.distance, _camF);
  const [cx, cy] = clampSection(
    CAM.x * CAM_OFFSET, CAM.y * CAM_OFFSET, 0.62,
  );
  camera.position.copy(_camF.p)
    .addScaledVector(_camF.r, cx)
    .addScaledVector(_camF.u, cy);
  // build the orientation straight from the frame. lookAt() degenerates when
  // the forward axis drifts towards the up axis, which is what made the view
  // shiver on some stretches of the curve
  _negF.copy(_camF.f).negate();
  _basis.makeBasis(_camF.r, _camF.u, _negF);
  camera.quaternion.setFromRotationMatrix(_basis);
  camera.rotateZ(CAM.roll);
  camera.updateMatrixWorld();
}

function step(dt) {
  if (startingAudio) return;
  G.time += dt;
  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) elMsg.classList.remove('show');
  }

  if (G.state === State.MENU) {
    // the menu only ever moves forward, very slowly; the corridor keeps being built
    G.distance += 2.6 * dt;
    G.beatLocal += dt * BPM / 60;

    const dampM = 1 - Math.exp(-dt * 4.5);
    CAM.x += (CAM.tx * 0.55 - CAM.x) * dampM;
    CAM.y += (CAM.ty * 0.55 - CAM.y) * dampM;
    // roll straight off the offset: the old velocity term divided by dt and
    // jittered badly whenever a frame ran long
    CAM.roll += ((-CAM.x * 0.050) - CAM.roll) * (1 - Math.exp(-dt * 5.0));

    placeCamera();
    tunnel.update(G.distance);
    const p = Math.pow(1 - ((G.beatLocal * 0.5) % 1), 3);
    tunnel.pulse(p * 0.15);
    return;
  }

  if (G.state === State.OVER) {
    G.distance += 3 * dt;
    placeCamera();
    tunnel.update(G.distance);
    return;
  }

  if (G.state === State.CRASH) {
    const recoil = Math.min(dt, G.recoil);
    G.recoil -= recoil;
    G.distance -= 26 * recoil;
    placeCamera();
    tunnel.update(G.distance);
    if (G.time >= G.settleAt) settleRun();
    return;
  }

  const prevBeat = G.beat;
  const nextBeat = audio.running ? audio.beat : prevBeat + dt / SEC_PER_BEAT;
  G.beat = Math.min(SONG_BEATS, Math.max(prevBeat, nextBeat));
  const elapsed = (G.beat - prevBeat) * SEC_PER_BEAT;
  const sdt = Math.min(dt, 0.05);
  if (FIXED_T === null) G.boosting = boostPointer !== null || keys.has('shift');
  const boost = G.boosting ? BOOST_MULTIPLIER : 1;
  const targetSpeed = (CRUISE_SPEED + Math.min(G.gatesPassed * 0.22, MAX_SPEED_BONUS)) * boost;
  G.speed += (targetSpeed - G.speed) * Math.min(1, elapsed * (boost > 1 ? 4 : 1.6));
  G.distance += G.speed * elapsed;

  while (G.chartIndex < G.chart.length && G.chart[G.chartIndex].beat <= G.beat + SPAWN_LOOKAHEAD) {
    const c = G.chart[G.chartIndex++];
    gates.spawn(c.beat, G.beat, G.speed, SEC_PER_BEAT, G.time, c.sector);
  }

  // camera --------------------------------------------------------
  readKeyboard(sdt);
  if (ALIGN) {
    const best = gates.list.find(g => !g.passed);
    if (best) {
      const [hx, hy] = lanePoint(best.open, best.axis);
      CAM.tx = hx;
      CAM.ty = hy;
    }
  }

  const prevX = CAM.x, prevY = CAM.y;
  const damp = 1 - Math.exp(-sdt * 20);
  CAM.x += (CAM.tx - CAM.x) * damp;
  CAM.y += (CAM.ty - CAM.y) * damp;
  CAM.roll += ((-CAM.x * 0.028) - CAM.roll) * (1 - Math.exp(-sdt * 8));

  G.score += G.speed * elapsed * 0.35;
  for (const g of gates.list) {
    if (g.passed) continue;
    if (g.beat > G.beat) break;

    g.passed = true;
    G.gatesJudged++;
    const fraction = G.beat > prevBeat
      ? THREE.MathUtils.clamp((g.beat - prevBeat) / (G.beat - prevBeat), 0, 1) : 1;
    const x = THREE.MathUtils.lerp(prevX, CAM.x, fraction);
    const y = THREE.MathUtils.lerp(prevY, CAM.y, fraction);

    if (g.canPass(x, y) || GOD) {
      const [lx, ly] = lanePoint(g.open, g.axis);
      G.gatesPassed++;
      G.combo++;
      G.maxCombo = Math.max(G.maxCombo, G.combo);

      const d = DIFFICULTY[difficulty];
      const boostMul = G.boosting ? 1.5 : 1.0;
      G.score += 100 * d.mult * boostMul * (1 + Math.min(G.combo, 50) * 0.05);

      if (Math.hypot(x - lx, y - ly) < 0.42 * 2.2) {
        G.score += 150 * d.mult;
        message('CLEAN ×' + G.combo, 0.6);
      }
    } else {
      G.combo = 0;
      if (g.beat >= G.invulnUntil) takeHit(g);
      if (G.runOver) {
        const overshoot = G.speed * (G.beat - g.beat) * SEC_PER_BEAT;
        G.distance -= overshoot;
        G.score -= overshoot * 0.35;
        G.beat = g.beat;
        break;
      }
    }
  }
  gates.prune(G.beat);

  placeCamera();

  // beat pulse ----------------------------------------------------
  const frac = G.beat - Math.floor(G.beat);
  const pulse = Math.pow(1 - frac, 4);

  // hue -----------------------------------------------------------
  const phasePos = G.beat / PHASE_BEATS;
  const idx = Math.floor(phasePos);
  const local = phasePos - idx;
  const from = PHASES[(idx + 0) % PHASES.length];
  const to = PHASES[(idx + 1) % PHASES.length];
  const t = THREE.MathUtils.smoothstep(local, 0.78, 1.0);
  currentHue = from + (to - from) * t;

  tunnel.setHue((currentHue + 1) % 1, 1.0, 0.5);
  tunnel.pulse(pulse * (G.state === State.PLAY ? 0.55 : 0.18));
  tunnel.update(G.distance);
  fog.color.setHSL((currentHue + 1) % 1, 0.75, 0.030);

  // fov kick ------------------------------------------------------
  const boostFov = (G.boosting && G.state === State.PLAY) ? 7.0 : 0;
  camera.fov = 76 + pulse * 3.4 + boostFov + (G.state === State.PLAY ? Math.min(G.speed, 56) * 0.045 : 0);
  camera.updateProjectionMatrix();

  // The last stretch washes out to white.
  const escape = (G.beat - (SONG_BEATS - 12)) / 12;
  if (escape > 0 && !G.runOver) {
    elFlash.style.transition = 'none';
    elFlash.style.opacity = String(escape * 0.95);
  }

  gates.update(G.beat, G.speed, SEC_PER_BEAT, G.time, currentHue);
  if (G.beat >= SONG_BEATS && !G.runOver) endRun('ESCAPED');

  // focus: pull to the gate you are about to thread -----------------
  let focus = 46;
  for (const g of gates.list) {
    if (g.d > 1 && g.d < focus) focus = g.d;
  }
  post.setFocus(THREE.MathUtils.clamp(focus * 1.05, 26, 130));
  post.setBoost(G.boosting && G.state === State.PLAY ? 1 : 0);

  // reticle -------------------------------------------------------
  let locked = false;
  for (const g of gates.list) {
    if (g.d > 3 && g.d < 34) {
      if (g.canPass(CAM.x, CAM.y)) locked = true;
      break;
    }
  }
  elCursor.classList.toggle('lock', locked && G.state === State.PLAY);

  // shake ---------------------------------------------------------
  if (G.shake > 0 && FIXED_T === null) {
    G.shake = Math.max(0, G.shake - sdt * 2.2);
    const s = G.shake * G.shake;
    camera.position.x += (Math.random() - 0.5) * s * 0.9;
    camera.position.y += (Math.random() - 0.5) * s * 0.9;
  }

  updateHud();
}

/* One cursor, everywhere.
   In menus it sits on the pointer. In flight it is projected from the vessel's
   world position, so what you aim with is exactly what collides. The camera
   trails at CAM_OFFSET, which is what makes the cursor slide rather than sit
   still in the middle of the screen. */
function updateCursor() {
  // The reticle tracks the hand across the whole window. It used to be the
  // projected vessel position, which meant it could only ever travel the 12%
  // of the offset the camera does not follow — it looked pinned.
  paintCursor(PTR.x, PTR.y);
}

/* ------------------------------------------------------------------ *
 *  Render
 * ------------------------------------------------------------------ */
let lastT = performance.now();

function render(now) {
  if (DBG) {
    renderer.info.autoReset = false;
    renderer.info.reset();
  }
  updateCursor();
  if (wireframe || NO_POST) {
    renderer.setRenderTarget(null);
    camera.fov = wireframe ? 82 : camera.fov;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  } else {
    post.render(scene, camera, G.time);
  }
  if (DBG) {
    const i = renderer.info.render;
    document.getElementById('errbox').textContent =
      `state=${G.state} wire=${wireframe} calls=${i.calls} tris=${i.triangles} ` +
      `gates=${gates.list.length} d=${G.distance.toFixed(1)} beat=${G.beat.toFixed(2)} ` +
      `hue=${currentHue.toFixed(3)}`;
  }
}

/* ------------------------------------------------------------------ *
 *  Main loop
 * ------------------------------------------------------------------ */
function loop(now) {
  if (disposed) return;
  const raw = (now - lastT) / 1000;
  lastT = now;
  const dt = Math.max(0, raw);
  if (document.hidden || contextLost) {
    requestAnimationFrame(loop);
    return;
  }

  /* keep an eye on the frame time; if we cannot hold ~38 fps, give up pixels
     before we give up geometry */
  frameTimes.push(dt);
  if (frameTimes.length > 180) frameTimes.shift();
  if (!droppedRes && frameTimes.length === 180) {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const median = sorted[90];
    if (median > 1 / 38 && renderer.getPixelRatio() > 1) {
      droppedRes = true;
      resize();
    }
  }

  step(dt);
  rec.sample(performance.now() / 1000, camera, G, CAM);
  rec.draw();
  render(now);

  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ *
 *  Resize
 * ------------------------------------------------------------------ */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, droppedRes ? 1 : QUALITY.pr);
  if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h, pr);
  updateCursor();
}
window.addEventListener('resize', resize);

function pauseForSurface(paused) {
  clearInput();
  lastT = performance.now();
  frameTimes.length = 0;
  if (audio.running) {
    const transition = paused ? audio.ctx.suspend() : audio.ctx.resume();
    transition.catch(error => console.warn('Audio surface transition failed', error));
  }
}

document.addEventListener('visibilitychange', () => pauseForSurface(document.hidden || contextLost));
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  contextLost = true;
  pauseForSurface(true);
});
canvas.addEventListener('webglcontextrestored', () => {
  if (disposed) return;
  environment.dispose();
  environment = makeEnvMap(renderer);
  scene.environment = environment.texture;
  contextLost = false;
  resize();
  pauseForSurface(document.hidden);
});
window.addEventListener('pagehide', event => {
  if (event.persisted) {
    pauseForSurface(true);
    return;
  }
  disposed = true;
  clearRunEffects();
  audio.stop();
  audio.ctx?.close().catch(error => console.warn('Audio close failed', error));
  gates.dispose();
  tunnel.dispose();
  post.dispose();
  for (const texture of Object.values(tex)) texture.dispose();
  scene.background?.dispose();
  environment.dispose();
  rec.canvas.remove();
  renderer.dispose();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) pauseForSurface(document.hidden || contextLost);
});

/* ------------------------------------------------------------------ *
 *  UI wiring
 * ------------------------------------------------------------------ */
document.getElementById('ui').addEventListener('click', (e) => {
  const volBtn = e.target.closest('[data-vol-step]');
  if (volBtn) {
    stepVolume(Number(volBtn.dataset.volStep));
    return;
  }
  const diffBtn = e.target.closest('[data-diff]');
  if (diffBtn) {
    difficulty = diffBtn.dataset.diff;
    localStorage.setItem('sofaraway.difficulty', difficulty);
    syncDifficulty();
    return;
  }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'start' || act === 'restart') startGame();
  if (act === 'menu') toMenu();
  if (act === 'fullscreen') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  if (act === 'credits') openPanel('CREDITS', `
    <b>SoFaraway</b> — a browser rhythm runner.<br>
    Thread the gates, ride the beat.<br><br>
    Made by <b>librecosta</b>.<br>
    Built with three.js r187 on WebGL2.<br>
    Every material, shader, texture and note is generated at runtime —<br>
    the project ships zero image and zero audio files.<br><br>
    <b>INSPIRATION</b><br>
    Mechanism inspired by HelloRun (HelloEnjoy, 2013),<br>
    which proved a browser game could be this hypnotic.<br>
    No code, assets or audio from it are used here.
  `);
  if (act === 'share') {
    const url = location.href.split('?')[0];
    navigator.clipboard?.writeText(url).then(
      () => message('LINK COPIED', 1.2),
      () => message(url, 2.5)
    );
  }
  if (act === 'settings') { show(settings, true); syncQuality(); }
  if (act === 'closepanel') elPanel.classList.add('hidden');
});

function stepVolume(dir) {
  const ready = VOLUMES.filter((v) => v.ready);
  const i = ready.findIndex((v) => v.id === VOL.id);
  const next = ready[(i + dir + ready.length) % ready.length];
  if (next && next.id !== VOL.id) {
    const url = new URL(location.href);
    url.searchParams.set('vol', next.id);
    location.href = url.toString();
  }
}

settings.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="closesettings"]') || e.target === settings) {
    show(settings, false);
  }
  const qBtn = e.target.closest('[data-q]');
  if (qBtn) {
    const v = qBtn.dataset.q;
    try { localStorage.setItem('sofaraway.quality', v); } catch (err) { /* ignore */ }
    const url = new URL(location.href);
    url.searchParams.set('q', v);
    location.href = url.toString();
  }
});

const volumeInput = $('set-volume');
try { volumeInput.value = localStorage.getItem('sofaraway.volume') ?? '80'; } catch (err) { /* ignore */ }
audio.setVolume(Number(volumeInput.value) / 100);
volumeInput.addEventListener('input', () => {
  audio.setVolume(Number(volumeInput.value) / 100);
  try { localStorage.setItem('sofaraway.volume', volumeInput.value); } catch (err) { /* ignore */ }
});

function syncQuality() {
  let stored = 'auto';
  try { stored = localStorage.getItem('sofaraway.quality') || 'auto'; } catch (e) { /* ignore */ }
  const chosen = params.get('q') || stored;
  const shown = chosen === 'mobile' ? 'auto' : chosen;
  for (const b of document.querySelectorAll('[data-q]')) {
    b.classList.toggle('on', b.dataset.q === shown);
  }
}
syncQuality();
if (params.get('panel') === '1') { $('settings').classList.remove('hidden'); syncQuality(); }

function syncVolume() {
  const el = $('vol-name');
  if (el) el.textContent = VOL.subtitle.replace('VOL.', '').trim() + ' \u00b7 ' + VOL.name;
}
syncVolume();

function syncDifficulty() {
  for (const b of document.querySelectorAll('[data-diff]')) {
    const key = b.dataset.diff;
    b.classList.toggle('active', key === difficulty);
    const n = DIFFICULTY[key].lives;
    const em = b.querySelector('em');
    if (em) em.textContent = n + (n === 1 ? ' LIFE' : ' LIVES');
  }
}
syncDifficulty();

function openPanel(title, html) {
  $('panel-title').textContent = title;
  $('panel-body').innerHTML = html;
  elPanel.classList.remove('hidden');
}

/* ------------------------------------------------------------------ *
 *  Start
 * ------------------------------------------------------------------ */
resize();

if (FIXED_T !== null) {
  // deterministic capture: simulate, then present a single frame
  if (params.has('diff') && DIFFICULTY[params.get('diff')]) {
    difficulty = params.get('diff');
  }
  gates.clear();
  resetRun();
  if (params.get('boost') === '1') G.boosting = true;
  setState(State.PLAY);
  const FIXED_DT = 1 / 60;
  const steps = Math.floor(FIXED_T / FIXED_DT);
  for (let i = 0; i < steps; i++) step(FIXED_DT);
  const remainder = FIXED_T - steps * FIXED_DT;
  if (remainder > 0) step(remainder);
  if (!contextLost) render(performance.now());
  // Keep presenting so the compositor picks up the capture and resizes.
  (function tick() {
    if (disposed) return;
    if (!contextLost) render(performance.now());
    requestAnimationFrame(tick);
  })();
} else if (AUTOPLAY) {
  startGame(navigator.userActivation?.hasBeenActive === true);
  requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(loop); });
} else {
  lastT = performance.now();
  requestAnimationFrame(loop);
}
