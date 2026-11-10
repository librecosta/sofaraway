import * as THREE from 'three';
import { buildTextures } from './textures.js';
import { Tunnel, TUNNEL } from './tunnel.js';
import { Gates, sectorOf, sectorPoint } from './gates.js';
import { PostFX } from './post.js';
import { AudioEngine } from './audio.js';
import { chartFor, DIFFICULTY, SONG_BEATS } from './chart.js';

/* ------------------------------------------------------------------ *
 *  Boot flags
 * ------------------------------------------------------------------ */
const params = new URLSearchParams(location.search);
const FIXED_T = params.has('t') ? parseFloat(params.get('t')) : null;
const LOWQ = params.get('q') === 'low';
const AUTOPLAY = params.get('auto') === '1' || FIXED_T !== null;
const NO_POST = params.get('post') === '0';
const DBG = params.get('dbg') === '1';
const ALIGN = params.get('align') === '1';
let GOD = params.get('god') === '1';

/* ------------------------------------------------------------------ *
 *  Renderer
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('gl');
THREE.ColorManagement.enabled = false;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);

const PR = LOWQ ? 1 : Math.min(window.devicePixelRatio || 1, 1.6);
renderer.setPixelRatio(PR);
renderer.setSize(window.innerWidth, window.innerHeight, false);

/* ------------------------------------------------------------------ *
 *  Scene
 * ------------------------------------------------------------------ */
const scene = new THREE.Scene();
const FOG_PLAY = 0x000000;
const fog = new THREE.FogExp2(FOG_PLAY, 0.0118);
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
  return rt.texture;
}
scene.environment = makeEnvMap(renderer);

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 420);
camera.position.set(0, 0, 0);

const tex = buildTextures();
const tunnel = new Tunnel(tex);
scene.add(tunnel.group);

const gates = new Gates(scene);
const post = new PostFX(renderer);
post.setSize(window.innerWidth, window.innerHeight, PR);
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
  if (on) tunnel.setHue(0.55, 0.0, 0.5);
}
setWireframe(true);

/* ------------------------------------------------------------------ *
 *  Audio
 * ------------------------------------------------------------------ */
const audio = new AudioEngine(128);
const BPM = 128;
const SEC_PER_BEAT = 60 / BPM;

/* ------------------------------------------------------------------ *
 *  Game state
 * ------------------------------------------------------------------ */
const State = { MENU: 'menu', PLAY: 'play', CRASH: 'crash', OVER: 'over' };

const DIFF_KEYS = ['easy', 'normal', 'hard'];
let difficulty = localStorage.getItem('elsewhere.difficulty') || 'normal';
if (!DIFFICULTY[difficulty]) difficulty = 'normal';

const G = {
  state: State.MENU,
  time: 0,
  beat: 0,
  beatLocal: 0,
  distance: 0,
  speed: 24,
  score: 0,
  best: parseInt(localStorage.getItem('elsewhere.best') || '0', 10),
  combo: 0,
  maxCombo: 0,
  gatesPassed: 0,
  gatesTotal: 0,
  hits: 0,
  lives: 2,
  maxLives: 2,
  invuln: 0,
  boosting: false,
  runOver: false,
  chart: [],
  chartIndex: 0,
  timeScale: 1,
  shake: 0,
  hitFlash: 0,
};

const PHASES = [0.44, 0.78, 0.92, 0.57, 0.09, 0.66];
const PHASE_BEATS = 32;
const SPAWN_LOOKAHEAD = 9;   // beats of warning before a gate arrives

let currentHue = PHASES[0];
let phaseIndex = 0;

const CAM = { x: 0, y: 0, tx: 0, ty: 0, roll: 0 };
const RANGE_X = TUNNEL.a - 0.32;
const RANGE_Y = TUNNEL.b - 0.32;
/* the camera trails the vessel instead of sitting on it, so the marker you
   steer is visibly *off-centre* — first person, but not glued to the axis */
const CAM_OFFSET = 0.88;
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

function show(el, on) { el.classList.toggle('hidden', !on); }

function setState(s) {
  G.state = s;
  show(elMenu, s === State.MENU);
  show(elHud, s === State.PLAY);
  show(elOver, s === State.OVER);
  setWireframe(s === State.MENU);
}

function flash(amount = 0.8, ms = 220, color = '#ffffff') {
  elFlash.style.background = color;
  elFlash.style.opacity = String(amount);
  elFlash.style.transition = 'none';
  requestAnimationFrame(() => {
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
  PTR.x = e.clientX; PTR.y = e.clientY;
  if (e.pointerType === 'touch') return;
  elCursor.classList.remove('hidden');
}, { passive: true });

window.addEventListener('pointerover', (e) => {
  const t = e.target;
  const hit = t && t.closest ? t.closest('[data-act]') : null;
  elCursor.classList.toggle('hover', !!hit);
}, true);

window.addEventListener('pointerdown', () => {
  elCursor.classList.add('down');
  if (G.state === State.PLAY) G.boosting = true;
});
window.addEventListener('pointerup', () => {
  elCursor.classList.remove('down');
  G.boosting = false;
});
window.addEventListener('pointercancel', () => { G.boosting = false; });
window.addEventListener('blur', () => { G.boosting = false; });
document.addEventListener('pointerleave', () => elCursor.classList.add('hidden'));
document.addEventListener('pointerenter', () => elCursor.classList.remove('hidden'));

/* ------------------------------------------------------------------ *
 *  Input
 * ------------------------------------------------------------------ */
const pointers = { x: 0.5, y: 0.5 };
let usingKeyboard = false;

function pointerToTarget(cx, cy) {
  const nx = (cx / window.innerWidth) * 2 - 1;
  const ny = (cy / window.innerHeight) * 2 - 1;
  CAM.tx = THREE.MathUtils.clamp(nx, -1, 1) * RANGE_X;
  CAM.ty = THREE.MathUtils.clamp(-ny, -1, 1) * RANGE_Y;
}

window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  usingKeyboard = false;
  pointerToTarget(e.clientX, e.clientY);
}, { passive: true });

window.addEventListener('pointerdown', (e) => {
  if (G.state === State.PLAY && e.pointerType === 'touch') {
    pointerToTarget(e.clientX, e.clientY);
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (e.touches.length) {
    pointerToTarget(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: true });

const keys = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();

  if (k === ' ' || k === 'enter') {
    if (G.state === State.MENU) startGame();
    else if (G.state === State.OVER) startGame();
  }
  if (k === 'escape') {
    if (G.state === State.PLAY || G.state === State.OVER) toMenu();
  }
  if (k === 'shift') { if (G.state === State.PLAY) G.boosting = true; }
  if (k === 'm') { audio.setMuted(!audio.muted); message(audio.muted ? 'MUTED' : 'SOUND ON', 0.8); }
  keys.add(k);
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === 'shift') G.boosting = false;
});
window.addEventListener('blur', () => keys.clear());

function readKeyboard(dt) {
  let ax = 0, ay = 0;
  if (keys.has('arrowleft') || keys.has('a')) ax -= 1;
  if (keys.has('arrowright') || keys.has('d')) ax += 1;
  if (keys.has('arrowup') || keys.has('w')) ay += 1;
  if (keys.has('arrowdown') || keys.has('s')) ay -= 1;
  if (ax || ay) {
    usingKeyboard = true;
    const sp = 6.2;
    CAM.tx = THREE.MathUtils.clamp(CAM.tx + ax * sp * dt, -RANGE_X, RANGE_X);
    CAM.ty = THREE.MathUtils.clamp(CAM.ty + ay * sp * dt, -RANGE_Y, RANGE_Y);
  }
}

/* ------------------------------------------------------------------ *
 *  Flow
 * ------------------------------------------------------------------ */
function resetRun() {
  const d = DIFFICULTY[difficulty];
  G.chart = chartFor(difficulty, d.seed);
  G.chartIndex = 0;
  G.gatesTotal = G.chart.length;
  G.maxLives = d.lives;
  G.lives = d.lives;
  G.distance = 0;
  G.speed = 24;
  G.score = 0;
  G.combo = 0;
  G.maxCombo = 0;
  G.gatesPassed = 0;
  G.hits = 0;
  G.invuln = 0;
  G.runOver = false;
  G.boosting = false;
  G.time = 0;
  G.beatLocal = 0;
  G.timeScale = 1;
  G.shake = 0;
  G.hitFlash = 0;
  phaseIndex = 0;
  currentHue = PHASES[0];
  CAM.x = CAM.tx = 0;
  CAM.y = CAM.ty = 0;
  updateHud(true);
}

async function startGame() {
  flash(0.9, 260);
  gates.clear();
  resetRun();
  setState(State.PLAY);
  if (!FIXED_T) {
    try { await audio.start(); } catch (e) { /* ignore */ }
  }
}

function toMenu() {
  gates.clear();
  setState(State.MENU);
  audio.stop();
  G.time = 0;
  G.beatLocal = 0;
}

/* a hit costs a life; the run is only over when the last one goes */
function takeHit(gate) {
  if (G.state !== State.PLAY || G.invuln > 0) return;
  G.lives--;
  G.combo = 0;
  G.hits++;
  G.invuln = 1.4;
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
  G.timeScale = 1;
  audio.stop();

  const total = G.gatesPassed + G.hits;
  const acc = total > 0 ? G.gatesPassed / total : 0;

  let rank = 'C';
  if (G.lives > 0) {
    if (acc >= 0.985) rank = 'S';
    else if (acc >= 0.93) rank = 'A';
    else if (acc >= 0.82) rank = 'B';
  } else if (acc >= 0.93) {
    rank = 'B';
  }

  setTimeout(() => {
    G.state = State.OVER;
    show(elHud, false);
    show(elOver, true);
    $('over-title').textContent = title || 'RUN COMPLETE';
    elOverScore.textContent = String(Math.floor(G.score));
    $('over-rank').textContent = rank;
    $('over-gates').textContent = `${G.gatesPassed}/${G.gatesTotal}`;
    $('over-combo').textContent = String(G.maxCombo);
    $('over-acc').textContent = Math.round(acc * 100) + '%';

    if (G.score > G.best) {
      G.best = Math.floor(G.score);
      localStorage.setItem('elsewhere.best', String(G.best));
    }
  }, 700);
}

let shakeT = 0;
function shakeDom(amount) {
  shakeT = amount;
  document.body.style.transform = `translate(${(Math.random() - 0.5) * 22 * amount}px, ${(Math.random() - 0.5) * 22 * amount}px)`;
  setTimeout(() => { document.body.style.transform = ''; }, 90);
}

/* ------------------------------------------------------------------ *
 *  HUD
 * ------------------------------------------------------------------ */
function updateHud(force) {
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

  if (G.chart.length) {
    const c = G.chart[Math.min(G.chartIndex, G.chart.length - 1)];
    $('hud-section').textContent = (c && c.section) ? c.section : '—';
  }
}

/* ------------------------------------------------------------------ *
 *  Simulation
 * ------------------------------------------------------------------ */
function step(dt) {
  G.time += dt;

  if (G.state === State.MENU) {
    G.distance += 9 * dt;
    G.beatLocal += dt * BPM / 60;
    tunnel.update(G.distance);
    const p = Math.pow(1 - ((G.beatLocal * 0.5) % 1), 3);
    tunnel.pulse(p * 0.15);
    return;
  }

  if (G.state === State.OVER) {
    G.distance += 3 * dt;
    tunnel.update(G.distance);
    return;
  }

  // clock ---------------------------------------------------------
  const sdt = dt * G.timeScale;
  const dBeat = sdt * BPM / 60;

  if (FIXED_T !== null) {
    G.beatLocal += dBeat;
    G.beat = G.beatLocal;
  } else if (audio.running) {
    G.beat = audio.beat;
  } else {
    G.beatLocal += dBeat;
    G.beat = G.beatLocal;
  }

  // speed: the corridor keeps accelerating, and boosting adds on top
  // (gates are beat-indexed, so speed never desyncs them from the music)
  const boost = (G.boosting && G.state === State.PLAY) ? 1.45 : 1.0;
  const targetSpeed = (24 + Math.min(G.gatesPassed * 0.22, 10)) * boost;
  G.speed += (targetSpeed - G.speed) * Math.min(1, sdt * (boost > 1 ? 4.0 : 1.6));

  if (G.invuln > 0) G.invuln = Math.max(0, G.invuln - sdt);

  // distance ------------------------------------------------------
  if (G.state === State.PLAY) G.distance += G.speed * sdt;
  else G.distance += G.speed * sdt * 0.35;

  // camera --------------------------------------------------------
  if (ALIGN && G.state === State.PLAY) {
    let best = null;
    for (const g of gates.list) if (!g.passed && (!best || g.d < best.d)) best = g;
    if (best) {
      const [hx, hy] = sectorPoint(best.open);
      CAM.tx = hx;
      CAM.ty = hy;
    }
  }

  const damp = 1 - Math.exp(-sdt * 20);
  const prevX = CAM.x;
  CAM.x += (CAM.tx - CAM.x) * damp;
  CAM.y += (CAM.ty - CAM.y) * damp;
  const vx = (CAM.x - prevX) / Math.max(sdt, 1e-4);
  CAM.roll += ((-vx * 0.028) - CAM.roll) * Math.min(1, sdt * 8);

  camera.position.x = CAM.x * CAM_OFFSET;
  camera.position.y = CAM.y * CAM_OFFSET;
  camera.rotation.z = CAM.roll;
  camera.updateMatrixWorld();

  // beat pulse ----------------------------------------------------
  const frac = G.beat - Math.floor(G.beat);
  const pulse = Math.pow(1 - frac, 4);
  const barPulse = Math.pow(1 - ((G.beat / 4) % 1), 5);

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
  const boostFov = (G.boosting && G.state === State.PLAY) ? -4.5 : 0;
  camera.fov = 76 + pulse * 3.4 + boostFov + (G.state === State.PLAY ? Math.min(G.speed, 56) * 0.045 : 0);
  camera.updateProjectionMatrix();

  // spawn from the chart ------------------------------------------
  if (G.state === State.PLAY) {
    while (
      G.chartIndex < G.chart.length &&
      G.chart[G.chartIndex].beat - G.beat <= SPAWN_LOOKAHEAD
    ) {
      const c = G.chart[G.chartIndex++];
      gates.spawn(c.beat - G.beat, G.speed, SEC_PER_BEAT, G.time, c.sector);
    }
    if (G.beat >= SONG_BEATS + 6 && !G.runOver) endRun('RUN COMPLETE');
  }

  // gates ---------------------------------------------------------
  const prevBeatGate = gates.list.slice();
  gates.update(dBeat, G.speed, SEC_PER_BEAT, G.time, currentHue);

  if (G.state === State.PLAY) {
    for (const g of prevBeatGate) {
      if (!g.passed && g.dBeats <= 0) {
        g.passed = true;
        const sec = sectorOf(CAM.x, CAM.y);

        if (sec === g.open || GOD) {
          const ang = Math.atan2(CAM.y, CAM.x);
          let da = Math.abs(ang - g.open * Math.PI / 4);
          da = Math.abs(((da % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
          if (da > Math.PI) da = Math.PI * 2 - da;
          const off = da / (Math.PI / 8);

          G.gatesPassed++;
          G.combo = Math.min(50, G.combo + 1);
          G.maxCombo = Math.max(G.maxCombo, G.combo);

          const d = DIFFICULTY[difficulty];
          const boostMul = G.boosting ? 1.5 : 1.0;
          G.score += 100 * d.mult * boostMul * (1 + G.combo * 0.05);

          if (off < 0.42) {
            G.score += 150 * d.mult;
            message('CLEAN ×' + G.combo, 0.6);
          }
        } else if (G.invuln <= 0) {
          takeHit(g);
          if (G.runOver) break;
        }
      }
    }
  }

  // focus: pull to the gate you are about to thread -----------------
  let focus = 46;
  for (const g of gates.list) {
    if (g.d > 1 && g.d < focus) focus = g.d;
  }
  post.setFocus(THREE.MathUtils.clamp(focus * 1.05, 26, 130));

  // score from distance ------------------------------------------
  if (G.state === State.PLAY) G.score += G.speed * sdt * 0.35;

  // reticle -------------------------------------------------------
  let locked = false;
  for (const g of gates.list) {
    if (g.d > 3 && g.d < 34) {
      if (sectorOf(CAM.x, CAM.y) === g.open) locked = true;
      break;
    }
  }
  elCursor.classList.toggle('lock', locked && G.state === State.PLAY);

  // shake ---------------------------------------------------------
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - sdt * 2.2);
    const s = G.shake * G.shake;
    camera.position.x += (Math.random() - 0.5) * s * 0.9;
    camera.position.y += (Math.random() - 0.5) * s * 0.9;
  }

  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) elMsg.classList.remove('show');
  }

  updateHud();
}

/* One cursor, everywhere.
   In menus it sits on the pointer. In flight it is projected from the vessel's
   world position, so what you aim with is exactly what collides. The camera
   trails at CAM_OFFSET, which is what makes the cursor slide rather than sit
   still in the middle of the screen. */
function updateCursor() {
  if (G.state === State.PLAY || G.state === State.CRASH) {
    camera.updateMatrixWorld();
    _v3.set(CAM.x, CAM.y, -1.6).project(camera);
    const vw = window.innerWidth, vh = window.innerHeight;
    paintCursor((_v3.x * 0.5 + 0.5) * vw, (-_v3.y * 0.5 + 0.5) * vh);
  } else {
    paintCursor(PTR.x, PTR.y);
  }
}

/* ------------------------------------------------------------------ *
 *  Render
 * ------------------------------------------------------------------ */
let lastT = performance.now();

function render(now) {
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
  const raw = (now - lastT) / 1000;
  lastT = now;
  const dt = Math.min(raw, 0.05);

  step(dt);
  render(now);

  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ *
 *  Resize
 * ------------------------------------------------------------------ */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h, PR);
  updateCursor();
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ *
 *  UI wiring
 * ------------------------------------------------------------------ */
document.getElementById('ui').addEventListener('click', (e) => {
  const diffBtn = e.target.closest('[data-diff]');
  if (diffBtn) {
    difficulty = diffBtn.dataset.diff;
    localStorage.setItem('elsewhere.difficulty', difficulty);
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
    <b>ELSEWHERE</b> — a browser rhythm runner.<br>
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
  if (act === 'settings') {
    openPanel('SETTINGS', `
      MOUSE / TOUCH / ARROWS — steer<br>
      SPACE — start · restart<br>
      M — mute · ESC — menu<br><br>
      Rendering: ${renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1'} · DPR ${PR.toFixed(2)}
    `);
  }
  if (act === 'closepanel') elPanel.classList.add('hidden');
});

function syncDifficulty() {
  for (const b of document.querySelectorAll('[data-diff]')) {
    b.classList.toggle('active', b.dataset.diff === difficulty);
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
  if (params.get('god') !== '1') GOD = true;   // captures should reach the end
  gates.clear();
  resetRun();
  setState(State.PLAY);
  const FIXED_DT = 1 / 60;
  let acc = 0;
  while (acc < FIXED_T) {
    step(FIXED_DT);
    acc += FIXED_DT;
  }
  render(performance.now());
  // keep presenting so the compositor definitely picks up the frame
  (function tick() {
    render(performance.now());
    requestAnimationFrame(tick);
  })();
} else if (AUTOPLAY) {
  startGame();
  requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(loop); });
} else {
  lastT = performance.now();
  requestAnimationFrame(loop);
}
