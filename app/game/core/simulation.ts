import type { Difficulty, RunResult } from '../contracts';
import { chartFor, difficultySettings } from './chart';
import { canPass, clamp, lanePoint, opening } from './collision';
import type { Axis } from './collision';
import { steer } from './input';
import type { InputFrame } from './input';
import { LUMEN_POINTS, PICKUP_BEAT, PICKUP_LOCAL_X, PICKUP_LOCAL_Y, PICKUP_RADIUS,
  pickupForSeed, RESONANCE_BONUS, RESONANCE_CHARGES } from './pickups';
import type { RunPickup } from './pickups';
import { CAPTURE_RUN_SEED } from './run-seed';
import { sectionAt } from './volumes';
import type { GateKind, VolumeDefinition } from './volumes';

export const START_DISTANCE = 4200;
const MENU_DISTANCE = START_DISTANCE + 140;
const CRUISE_SPEED = 24;
const SPEED_BONUS = 10;
const BOOST_MULTIPLIER = 1.45;
const GATE_PRELOAD_BEATS = 14;

export function corridorLength(volume: VolumeDefinition) {
  return START_DISTANCE + volume.beats * 60 / volume.bpm
    * (CRUISE_SPEED + SPEED_BONUS) * BOOST_MULTIPLIER + 650;
}

export interface RunGate {
  readonly beat: number;
  readonly kind: GateKind;
  readonly open: number;
  readonly axis: Axis;
  judged: boolean;
  hit: boolean;
}

export class Simulation {
  phase: 'menu' | 'playing' | 'crash' | 'results' = 'menu';
  time = 0;
  beat = 0;
  distance = MENU_DISTANCE;
  speed = CRUISE_SPEED;
  score = 0;
  combo = 0;
  maxCombo = 0;
  gatesPassed = 0;
  gatesJudged = 0;
  hits = 0;
  lives = 0;
  maxLives = 0;
  boosting = false;
  message = '';
  result: RunResult | null = null;
  hitTime = -Infinity;
  pickup: RunPickup | null = null;
  pickupTime = -Infinity;
  shield = false;
  resonance = 0;
  camera = { x: 0, y: 0, tx: 0, ty: 0, roll: 0 };
  previewGates: RunGate[] = [];
  private chart: RunGate[] = [];
  private reveal = 0;
  private judged = 0;
  private invulnUntil = 0;
  private settleAt = 0;
  private recoil = 0;
  private messageUntil = 0;
  private mult = 1;
  private difficulty: Difficulty = 'normal';
  readonly secondsPerBeat: number;

  constructor(
    readonly volume: VolumeDefinition,
    private readonly options: { align?: boolean; god?: boolean } = {},
  ) {
    this.secondsPerBeat = 60 / volume.bpm;
  }

  get gatesTotal() { return this.chart.length; }
  get section() { return sectionAt(this.volume, this.beat)?.name ?? this.volume.sections.at(-1)!.name; }
  get progress() { return this.beat / this.volume.beats; }

  start(difficulty: Difficulty, runSeed = CAPTURE_RUN_SEED) {
    if (this.phase !== 'menu' && this.phase !== 'results') return false;
    const rules = difficultySettings(this.volume, difficulty);
    let rng = 987654321;
    this.chart = chartFor(this.volume, difficulty, rules.seed).map(({ beat, kind, sector }) => {
      let axis: Axis = 0;
      if (kind !== 'square' && kind !== 'diamond') {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        axis = rng / 0x7fffffff < 0.5 ? 0 : 1;
      }
      return { beat, kind, open: opening(kind, sector), axis, judged: false, hit: false };
    });
    this.phase = 'playing';
    this.time = this.beat = this.score = this.combo = this.maxCombo = 0;
    this.gatesPassed = this.gatesJudged = this.hits = this.reveal = this.judged = 0;
    this.invulnUntil = this.settleAt = this.recoil = this.messageUntil = 0;
    this.previewGates = [];
    this.difficulty = difficulty;
    this.pickup = this.volume.id === 'elsewhere' ? { kind: pickupForSeed(runSeed), status: 'pending' } : null;
    this.pickupTime = -Infinity;
    this.shield = false;
    this.resonance = 0;
    this.lives = this.maxLives = rules.lives;
    this.mult = rules.mult;
    this.distance = START_DISTANCE;
    this.speed = CRUISE_SPEED;
    this.boosting = false;
    this.hitTime = -Infinity;
    this.message = '';
    this.result = null;
    this.camera = { x: 0, y: 0, tx: 0, ty: 0, roll: 0 };
    this.preloadGates();
    return true;
  }

  returnToMenu() {
    this.phase = 'menu';
    this.previewGates = [];
    this.distance = MENU_DISTANCE;
    this.time = this.beat = 0;
    this.boosting = false;
    this.hitTime = -Infinity;
    this.pickup = null;
    this.pickupTime = -Infinity;
    this.shield = false;
    this.resonance = 0;
    this.message = '';
  }

  step(dt: number, input: InputFrame) {
    this.time += dt;
    if (this.time >= this.messageUntil) this.message = '';
    const camera = this.camera;
    if (this.phase === 'menu') {
      this.distance += 2.6 * dt;
      this.beat += dt / this.secondsPerBeat;
      [camera.tx, camera.ty] = steer(input, camera.tx, camera.ty, 0);
      const damp = 1 - Math.exp(-dt * 4.5);
      camera.x += (camera.tx * 0.55 - camera.x) * damp;
      camera.y += (camera.ty * 0.55 - camera.y) * damp;
      camera.roll += (-camera.x * 0.05 - camera.roll) * (1 - Math.exp(-dt * 5));
      return;
    }
    if (this.phase === 'results') {
      this.distance += 3 * dt;
      return;
    }
    if (this.phase === 'crash') {
      const recoil = Math.min(dt, this.recoil);
      this.recoil -= recoil;
      this.distance -= 26 * recoil;
      if (this.time + 1e-9 >= this.settleAt) this.phase = 'results';
      return;
    }

    const previousBeat = this.beat;
    this.beat = Math.min(this.volume.beats, this.beat + dt / this.secondsPerBeat);
    const elapsed = (this.beat - previousBeat) * this.secondsPerBeat;
    this.boosting = input.boosting;
    const boost = this.boosting ? BOOST_MULTIPLIER : 1;
    const targetSpeed = (CRUISE_SPEED + Math.min(this.gatesPassed * 0.22, SPEED_BONUS)) * boost;
    this.speed += (targetSpeed - this.speed) * Math.min(1, elapsed * (boost > 1 ? 4 : 1.6));
    this.distance += this.speed * elapsed;
    this.score += this.speed * elapsed * 0.35;

    this.preloadGates();
    [camera.tx, camera.ty] = steer(input, camera.tx, camera.ty, dt);
    const next = this.chart[this.judged];
    if (this.options.align && next && next.beat <= this.beat + 9) {
      [camera.tx, camera.ty] = lanePoint(next.kind, next.open, next.axis);
    }
    const { x, y } = camera;
    const damp = 1 - Math.exp(-dt * 20);
    camera.x += (camera.tx - camera.x) * damp;
    camera.y += (camera.ty - camera.y) * damp;
    camera.roll += (-camera.x * 0.028 - camera.roll) * (1 - Math.exp(-dt * 8));

    // The pickup is over a second from either gate, outside the same fixed step.
    if (this.pickup?.status === 'pending' && this.beat + 1e-9 >= PICKUP_BEAT) {
      const fraction = clamp((PICKUP_BEAT - previousBeat) / (this.beat - previousBeat), 0, 1);
      this.resolvePickup(this.pickup, x + (camera.x - x) * fraction, y + (camera.y - y) * fraction);
    }
    while (this.chart[this.judged]?.beat <= this.beat + 1e-9) {
      const gate = this.chart[this.judged++];
      const fraction = clamp((gate.beat - previousBeat) / (this.beat - previousBeat), 0, 1);
      this.judge(gate, x + (camera.x - x) * fraction, y + (camera.y - y) * fraction);
      if (this.lives === 0) {
        const overshoot = this.speed * (this.beat - gate.beat) * this.secondsPerBeat;
        this.distance -= overshoot;
        this.score -= overshoot * 0.35;
        this.beat = gate.beat;
        this.finish('TERMINATED');
        break;
      }
    }
    while (this.previewGates[0]?.beat < this.beat - 0.35) this.previewGates.shift();
    if (this.phase === 'playing' && this.beat + 1e-9 >= this.volume.beats) {
      this.beat = this.volume.beats;
      this.finish('ESCAPED');
    }
  }

  private resolvePickup(pickup: RunPickup, x: number, y: number) {
    if (Math.hypot(x - PICKUP_LOCAL_X, y - PICKUP_LOCAL_Y) > PICKUP_RADIUS) {
      this.pickup = { kind: pickup.kind, status: 'missed' };
      return;
    }
    this.pickup = { kind: pickup.kind, status: 'collected' };
    this.pickupTime = this.time;
    if (pickup.kind === 'shield') {
      this.shield = true;
      this.message = 'PRISM SHIELD';
    } else if (pickup.kind === 'resonance') {
      this.resonance = RESONANCE_CHARGES;
      this.message = 'RESONANCE ×' + this.resonance;
    } else {
      const points = LUMEN_POINTS[this.difficulty];
      this.score += points;
      this.message = 'LUMEN +' + points;
    }
    this.messageUntil = this.time + 1.1;
  }

  private preloadGates() {
    // Give Graphics time to stage gate meshes before they start to fade in.
    const throughBeat = this.beat + GATE_PRELOAD_BEATS;
    while (this.chart[this.reveal]?.beat <= throughBeat) {
      this.previewGates.push(this.chart[this.reveal++]);
    }
  }

  private judge(gate: RunGate, x: number, y: number) {
    gate.judged = true;
    this.gatesJudged++;
    if (this.options.god || canPass(gate.kind, gate.open, gate.axis, x, y)) {
      const [lx, ly] = lanePoint(gate.kind, gate.open, gate.axis);
      this.gatesPassed++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const gatePoints = 100 * this.mult * (this.boosting ? 1.5 : 1) * (1 + Math.min(this.combo, 50) * 0.05);
      this.score += gatePoints;
      let cleanPoints = 0;
      if (Math.hypot(x - lx, y - ly) < 0.42 * 2.2) {
        cleanPoints = 150 * this.mult;
        this.score += cleanPoints;
        this.message = 'CLEAN ×' + this.combo;
        this.messageUntil = this.time + 0.6;
      }
      if (this.resonance > 0) {
        this.score += (gatePoints + cleanPoints) * RESONANCE_BONUS;
        this.resonance--;
      }
    } else {
      this.combo = 0;
      if (gate.beat >= this.invulnUntil) {
        this.invulnUntil = gate.beat + 1.4 / this.secondsPerBeat;
        if (this.shield) {
          this.shield = false;
          return;
        }
        this.lives--;
        this.hits++;
        this.hitTime = this.time;
        gate.hit = true;
      }
    }
  }

  private finish(title: RunResult['title']) {
    const accuracy = this.gatesJudged ? this.gatesPassed / this.gatesJudged : 0;
    const rank = this.lives > 0
      ? accuracy >= 0.985 ? 'S' : accuracy >= 0.93 ? 'A' : accuracy >= 0.82 ? 'B' : 'C'
      : accuracy >= 0.93 ? 'B' : 'C';
    this.result = Object.freeze({ title, accuracy, rank });
    this.phase = 'crash';
    this.settleAt = this.time + 0.7;
    this.recoil = title === 'ESCAPED' ? 0 : 0.55;
    this.boosting = false;
    this.shield = false;
    this.resonance = 0;
  }
}
