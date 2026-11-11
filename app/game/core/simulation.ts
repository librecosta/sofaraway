import type { Difficulty, RunResult } from '../contracts';
import { chartFor, difficultySettings } from './chart';
import { canPass, clamp, lanePoint, opening } from './collision';
import type { Axis } from './collision';
import { steer } from './input';
import type { InputFrame } from './input';
import { sectionAt } from './volumes';
import type { VolumeDefinition } from './volumes';

export const START_DISTANCE = 4200;
const MENU_DISTANCE = START_DISTANCE + 140;
const CRUISE_SPEED = 24;
const SPEED_BONUS = 10;
const BOOST_MULTIPLIER = 1.45;

export function corridorLength(volume: VolumeDefinition) {
  return START_DISTANCE + volume.beats * 60 / volume.bpm
    * (CRUISE_SPEED + SPEED_BONUS) * BOOST_MULTIPLIER + 650;
}

export interface RunGate {
  readonly beat: number;
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
  camera = { x: 0, y: 0, tx: 0, ty: 0, roll: 0 };
  visibleGates: RunGate[] = [];
  private chart: RunGate[] = [];
  private reveal = 0;
  private judged = 0;
  private invulnUntil = 0;
  private settleAt = 0;
  private recoil = 0;
  private messageUntil = 0;
  private mult = 1;
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

  start(difficulty: Difficulty) {
    if (this.phase !== 'menu' && this.phase !== 'results') return false;
    const rules = difficultySettings(this.volume, difficulty);
    let rng = 987654321;
    this.chart = chartFor(this.volume, difficulty, rules.seed).map(gate => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return { beat: gate.beat, open: opening(this.volume.obstacle, gate.sector),
        axis: rng / 0x7fffffff < 0.5 ? 0 : 1, judged: false, hit: false };
    });
    this.phase = 'playing';
    this.time = this.beat = this.score = this.combo = this.maxCombo = 0;
    this.gatesPassed = this.gatesJudged = this.hits = this.reveal = this.judged = 0;
    this.invulnUntil = this.settleAt = this.recoil = this.messageUntil = 0;
    this.visibleGates = [];
    this.lives = this.maxLives = rules.lives;
    this.mult = rules.mult;
    this.distance = START_DISTANCE;
    this.speed = CRUISE_SPEED;
    this.boosting = false;
    this.hitTime = -Infinity;
    this.message = '';
    this.result = null;
    this.camera = { x: 0, y: 0, tx: 0, ty: 0, roll: 0 };
    return true;
  }

  returnToMenu() {
    this.phase = 'menu';
    this.visibleGates = [];
    this.distance = MENU_DISTANCE;
    this.time = this.beat = 0;
    this.boosting = false;
    this.hitTime = -Infinity;
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

    while (this.chart[this.reveal]?.beat <= this.beat + 9) {
      this.visibleGates.push(this.chart[this.reveal++]);
    }
    [camera.tx, camera.ty] = steer(input, camera.tx, camera.ty, dt);
    const next = this.chart[this.judged];
    if (this.options.align && next && next.beat <= this.beat + 9) {
      [camera.tx, camera.ty] = lanePoint(this.volume.obstacle, next.open, next.axis);
    }
    const { x, y } = camera;
    const damp = 1 - Math.exp(-dt * 20);
    camera.x += (camera.tx - camera.x) * damp;
    camera.y += (camera.ty - camera.y) * damp;
    camera.roll += (-camera.x * 0.028 - camera.roll) * (1 - Math.exp(-dt * 8));

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
    while (this.visibleGates[0]?.beat < this.beat - 0.35) this.visibleGates.shift();
    if (this.phase === 'playing' && this.beat + 1e-9 >= this.volume.beats) {
      this.beat = this.volume.beats;
      this.finish('ESCAPED');
    }
  }

  private judge(gate: RunGate, x: number, y: number) {
    gate.judged = true;
    this.gatesJudged++;
    if (this.options.god || canPass(this.volume.obstacle, gate.open, gate.axis, x, y)) {
      const [lx, ly] = lanePoint(this.volume.obstacle, gate.open, gate.axis);
      this.gatesPassed++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += 100 * this.mult * (this.boosting ? 1.5 : 1) * (1 + Math.min(this.combo, 50) * 0.05);
      if (Math.hypot(x - lx, y - ly) < 0.42 * 2.2) {
        this.score += 150 * this.mult;
        this.message = 'CLEAN ×' + this.combo;
        this.messageUntil = this.time + 0.6;
      }
    } else {
      this.combo = 0;
      if (gate.beat >= this.invulnUntil) {
        this.lives--;
        this.hits++;
        this.invulnUntil = gate.beat + 1.4 / this.secondsPerBeat;
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
  }
}
