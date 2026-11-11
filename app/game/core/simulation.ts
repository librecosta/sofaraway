import type { Difficulty, RunResult } from '../contracts';
import { branchDistance, branchLayout, BRANCH_PREVIEW_BEAT, REJOIN_BEAT,
  ROUTE_GATE_MULTIPLIERS, routeCharts, selectSide, SPLIT_BEAT } from './branches';
import type { BranchRun, RouteKind, RouteSide } from './branches';
import { chartFor, difficultySettings } from './chart';
import type { ChartGate } from './chart';
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
  readonly route?: RouteKind;
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
  branch: BranchRun | null = null;
  branchGates: Readonly<Record<RouteKind, readonly RunGate[]>> | null = null;
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
    private readonly options: { align?: boolean; god?: boolean; branchSide?: RouteSide } = {},
  ) {
    this.secondsPerBeat = 60 / volume.bpm;
  }

  get gatesTotal() { return this.chart.length; }
  get route() { return this.branch?.side ? this.branch.layout[this.branch.side] : null; }
  get trackDistance() {
    const { anchor, exit } = this.branch ?? {};
    if (!anchor) return this.distance;
    if (!exit) {
      // Crash/recoil is physical even if the authoritative beat stops inside the junction.
      return branchDistance(anchor, this.beat) + (this.phase === 'playing' ? 0 : this.distance - this.crashDistance);
    }
    const t = Math.max(0, this.beat - REJOIN_BEAT);
    const u = Math.min(1, t / 4);
    return branchDistance(anchor, REJOIN_BEAT) + this.distance - exit.distance
      + (anchor.unitsPerBeat - exit.unitsPerBeat) * t * (1 - u * u * (3 - 2 * u));
  }
  projectTrack(beat: number) {
    const { anchor, exit } = this.branch ?? {};
    if (anchor && !exit) return branchDistance(anchor, beat);
    const t = Math.max(0, this.beat - REJOIN_BEAT);
    const u = Math.min(1, t / 4);
    const correction = anchor && exit
      ? (anchor.unitsPerBeat - exit.unitsPerBeat) * (1 - u * u * (3 - 2 * u) - u * 6 * u * (1 - u)) : 0;
    return this.trackDistance + (this.speed * this.secondsPerBeat + correction) * (beat - this.beat);
  }
  private crashDistance = 0;
  get section() { return sectionAt(this.volume, this.beat)?.name ?? this.volume.sections.at(-1)!.name; }
  get progress() { return this.beat / this.volume.beats; }

  start(difficulty: Difficulty, runSeed = CAPTURE_RUN_SEED) {
    if (this.phase !== 'menu' && this.phase !== 'results') return false;
    const rules = difficultySettings(this.volume, difficulty);
    let rng = 987654321;
    const makeGate = ({ beat, kind, sector }: ChartGate, axis: Axis, route?: RouteKind): RunGate =>
      ({ beat, kind, open: opening(kind, sector), axis, judged: false, hit: false, ...(route ? { route } : {}) });
    const authored = chartFor(this.volume, difficulty, rules.seed);
    const gates = authored.map(gate => {
      let axis: Axis = 0;
      if (gate.kind !== 'square' && gate.kind !== 'diamond') {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        axis = rng / 0x7fffffff < 0.5 ? 0 : 1;
      }
      return makeGate(gate, axis);
    });
    const elsewhere = this.volume.id === 'elsewhere';
    this.branch = elsewhere ? { layout: branchLayout(runSeed), side: null, anchor: null, exit: null } : null;
    if (elsewhere) {
      const { main, challenge, score } = routeCharts(authored.filter(gate => gate.beat >= SPLIT_BEAT && gate.beat < REJOIN_BEAT));
      this.branchGates = {
        main: main.map(gate => makeGate(gate, 0, 'main')),
        challenge: challenge.map(gate => makeGate(gate, 0, 'challenge')),
        score: score.map(gate => makeGate(gate, 0, 'score')),
      };
      this.chart = gates.filter(gate => gate.beat < SPLIT_BEAT || gate.beat >= REJOIN_BEAT);
    } else {
      this.branchGates = null;
      this.chart = gates;
    }
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
    this.crashDistance = 0;
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
    this.branch = null;
    this.branchGates = null;
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
    const previousDistance = this.distance;
    const previousSpeed = this.speed;
    this.beat = Math.min(this.volume.beats, this.beat + dt / this.secondsPerBeat);
    const elapsed = (this.beat - previousBeat) * this.secondsPerBeat;
    this.boosting = input.boosting;
    const boost = this.boosting ? BOOST_MULTIPLIER : 1;
    const targetSpeed = (CRUISE_SPEED + Math.min(this.gatesPassed * 0.22, SPEED_BONUS)) * boost;
    this.speed += (targetSpeed - this.speed) * Math.min(1, elapsed * (boost > 1 ? 4 : 1.6));
    this.distance += this.speed * elapsed;
    this.score += this.speed * elapsed * 0.35;

    [camera.tx, camera.ty] = steer(input, camera.tx, camera.ty, dt);
    const next = this.chart[this.judged];
    if (this.options.align && next) {
      if (this.branch && !this.branch.side && next.beat >= REJOIN_BEAT) {
        const side = this.options.branchSide;
        [camera.tx, camera.ty] = [side === 'left' ? -2.15 : side === 'right' ? 2.15 : 0, 0];
      } else if (next.beat <= this.beat + 9) {
        [camera.tx, camera.ty] = lanePoint(next.kind, next.open, next.axis);
      }
    }
    const { x, y } = camera;
    const damp = 1 - Math.exp(-dt * 20);
    camera.x += (camera.tx - camera.x) * damp;
    camera.y += (camera.ty - camera.y) * damp;
    camera.roll += (-camera.x * 0.028 - camera.roll) * (1 - Math.exp(-dt * 8));

    if (this.branch && ((!this.branch.anchor && this.beat + 1e-9 >= BRANCH_PREVIEW_BEAT) ||
      (!this.branch.side && this.beat + 1e-9 >= SPLIT_BEAT) || (!this.branch.exit && this.beat + 1e-9 >= REJOIN_BEAT))) {
      const at = (beat: number) => clamp((beat - previousBeat) / (this.beat - previousBeat), 0, 1);
      const anchorAt = (beat: number) => {
        const k = at(beat);
        return { distance: previousDistance + (this.distance - previousDistance) * k,
          unitsPerBeat: (previousSpeed + (this.speed - previousSpeed) * k) * this.secondsPerBeat };
      };
      if (!this.branch.anchor && this.beat + 1e-9 >= BRANCH_PREVIEW_BEAT) {
        this.branch = { ...this.branch, anchor: anchorAt(BRANCH_PREVIEW_BEAT) };
      }
      if (!this.branch.side && this.beat + 1e-9 >= SPLIT_BEAT) {
        const side = selectSide(x + (camera.x - x) * at(SPLIT_BEAT));
        const gates = this.branchGates![this.branch.layout[side]];
        this.chart.splice(this.judged, 0, ...gates);
        this.branch = { ...this.branch, side };
      }
      if (!this.branch.exit && this.beat + 1e-9 >= REJOIN_BEAT) {
        this.branch = { ...this.branch, exit: anchorAt(REJOIN_BEAT) };
      }
    }
    this.preloadGates();

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
      const routeMult = gate.route ? ROUTE_GATE_MULTIPLIERS[gate.route] : 1;
      const gatePoints = 100 * this.mult * (this.boosting ? 1.5 : 1) * (1 + Math.min(this.combo, 50) * 0.05) * routeMult;
      this.score += gatePoints;
      let cleanPoints = 0;
      if (Math.hypot(x - lx, y - ly) < 0.42 * 2.2) {
        cleanPoints = 150 * this.mult * routeMult;
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
    this.result = Object.freeze({ title, accuracy, rank, ...(this.route ? { route: this.route } : {}) });
    this.crashDistance = this.distance;
    this.phase = 'crash';
    this.settleAt = this.time + 0.7;
    this.recoil = title === 'ESCAPED' ? 0 : 0.55;
    this.boosting = false;
    this.shield = false;
    this.resonance = 0;
  }
}
