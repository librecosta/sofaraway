import type { Difficulty, PlayMode, RunResult } from '../contracts';
import { branchDistance, branchLayout, branchSteeringWidth, BRANCH_GUIDANCE_END, BRANCH_PREVIEW_BEAT, BRANCH_SIDE_THRESHOLD, REJOIN_BEAT,
  ROUTE_GATE_MULTIPLIERS, routeCharts, selectSide, SPLIT_BEAT } from './branches';
import type { BranchRun, RouteKind, RouteSide } from './branches';
import { chartFor, difficultySettings } from './chart';
import type { ChartGate } from './chart';
import { canPass, clamp, lanePoint, opening, SECTION } from './collision';
import type { Axis } from './collision';
import { steer } from './input';
import type { InputFrame } from './input';
import { LUMEN_POINTS, PICKUP_BEAT, PICKUP_LOCAL_X, PICKUP_LOCAL_Y, PICKUP_RADIUS,
  pickupForSeed, RESONANCE_BONUS, RESONANCE_CHARGES } from './pickups';
import type { RunPickup } from './pickups';
import { CAPTURE_RUN_SEED } from './run-seed';
import { sightseeingChart, sightseeingRoute, SIGHTSEEING_LIVES, SIGHTSEEING_SPEED } from './sightseeing';
import { sectionAt } from './volumes';
import type { GateKind, VolumeDefinition } from './volumes';

export const START_DISTANCE = 4200;
const MENU_DISTANCE = START_DISTANCE + 140;
const CRUISE_SPEED = 24;
const SPEED_BONUS = 10;
const BOOST_MULTIPLIER = 1.45;
const BOOST_LENS_SECONDS = 0.18;
const BOOST_LOOKAHEAD_SECONDS = 0.32;
const GATE_PRELOAD_BEATS = 14;

// Distance added to the common track to carry the junction's exit tangent into the next four beats.
function rejoinCorrection(beat: number, slopeDifference: number) {
  const t = clamp(beat - REJOIN_BEAT, 0, 4);
  const u = t / 4;
  return slopeDifference * t * (1 - u * u * (3 - 2 * u));
}

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
  /** The crossing point in path distance, retained until the judged gate fades out. */
  trackPosition?: number;
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
  boostLens = 0;
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
  private playMode: PlayMode = 'standard';
  private referenceBeats: number[] = [];
  private referenceRoutes?: Readonly<Record<RouteKind, readonly RunGate[]>>;
  private referenceProgress = 0;
  private cruiseSpeed = CRUISE_SPEED;
  readonly secondsPerBeat: number;

  constructor(
    readonly volume: VolumeDefinition,
    private readonly options: { align?: boolean; god?: boolean; branchSide?: RouteSide } = {},
  ) {
    this.secondsPerBeat = 60 / volume.bpm;
  }

  get gatesTotal() { return this.chart.length; }
  get mode() { return this.playMode; }
  get route() { return this.branch?.side ? this.branch.layout[this.branch.side] : null; }
  get routeGuide() {
    return this.phase === 'playing' && this.beat + 1e-9 >= BRANCH_PREVIEW_BEAT && this.beat < BRANCH_GUIDANCE_END
      ? this.branch?.layout ?? null : null;
  }
  get routeSide() { return this.routeGuide ? this.branch?.side ?? selectSide(this.camera.x) : null; }
  get steeringWidth() { return this.branch ? branchSteeringWidth(this.beat) : 0; }
  get trackDistance() {
    const { anchor, exit } = this.branch ?? {};
    if (!anchor) return this.distance;
    if (!exit) {
      // Crash/recoil is physical even if the authoritative beat stops inside the junction.
      return branchDistance(anchor, this.beat) + (this.phase === 'playing' ? 0 : this.distance - this.crashDistance);
    }
    return branchDistance(anchor, REJOIN_BEAT) + this.distance - exit.distance
      + rejoinCorrection(this.beat, anchor.unitsPerBeat - exit.unitsPerBeat);
  }

  projectTrack(beat: number) {
    const { anchor, exit } = this.branch ?? {};
    if (anchor && beat <= REJOIN_BEAT) return branchDistance(anchor, beat);
    const originBeat = anchor && !exit ? REJOIN_BEAT : this.beat;
    const seconds = Math.max(0, beat - originBeat) * this.secondsPerBeat;
    // The player can release Boost on the next step. Integrate the transient velocity
    // over a short horizon instead of predicting it will last until every visible gate.
    const boostSeconds = -BOOST_LOOKAHEAD_SECONDS * Math.expm1(-seconds / BOOST_LOOKAHEAD_SECONDS);
    const travel = this.cruiseSpeed * seconds + (this.speed - this.cruiseSpeed) * boostSeconds;
    if (!anchor) return this.distance + travel;
    const origin = branchDistance(anchor, REJOIN_BEAT) + (exit ? this.distance - exit.distance : 0);
    const exitSlope = exit?.unitsPerBeat ?? this.speed * this.secondsPerBeat;
    return origin + travel + rejoinCorrection(beat, anchor.unitsPerBeat - exitSlope);
  }
  private crashDistance = 0;
  get section() { return sectionAt(this.volume, this.beat)?.name ?? this.volume.sections.at(-1)!.name; }
  get progress() { return this.beat / this.volume.beats; }

  start(difficulty: Difficulty, runSeed = CAPTURE_RUN_SEED, pickupKind = pickupForSeed(runSeed), mode: PlayMode = 'standard') {
    if (this.phase !== 'menu' && this.phase !== 'results') return false;
    this.playMode = mode;
    const sightseeing = mode === 'sightseeing';
    if (sightseeing) difficulty = 'normal';
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
    this.referenceBeats = sightseeing ? this.chart.map(gate => gate.beat) : [];
    this.referenceRoutes = sightseeing ? this.branchGates ?? undefined : undefined;
    this.referenceProgress = 0;
    if (sightseeing) {
      this.chart = sightseeingChart(this.chart, this.volume.sections);
      if (this.branchGates) {
        const { main, challenge, score } = this.branchGates;
        this.branchGates = {
          main: sightseeingRoute(main, 'main'), challenge: sightseeingRoute(challenge, 'challenge'),
          score: sightseeingRoute(score, 'score'),
        };
      }
    }
    this.phase = 'playing';
    this.time = this.beat = this.score = this.combo = this.maxCombo = 0;
    this.gatesPassed = this.gatesJudged = this.hits = this.reveal = this.judged = 0;
    this.invulnUntil = this.settleAt = this.recoil = this.messageUntil = 0;
    this.previewGates = [];
    this.difficulty = difficulty;
    this.pickup = elsewhere ? { kind: pickupKind, status: 'pending' } : null;
    this.pickupTime = -Infinity;
    this.shield = false;
    this.resonance = 0;
    this.crashDistance = 0;
    this.lives = this.maxLives = sightseeing ? SIGHTSEEING_LIVES : rules.lives;
    this.mult = rules.mult;
    this.distance = START_DISTANCE;
    this.speed = CRUISE_SPEED * (sightseeing ? SIGHTSEEING_SPEED : 1);
    this.cruiseSpeed = this.speed;
    this.boosting = false;
    this.boostLens = 0;
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
    this.boostLens = 0;
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
    const previousWidth = this.steeringWidth;
    const previousDistance = this.distance;
    const previousTrack = this.trackDistance;
    const previousSpeed = this.speed;
    this.beat = Math.min(this.volume.beats, this.beat + dt / this.secondsPerBeat);
    const elapsed = (this.beat - previousBeat) * this.secondsPerBeat;
    this.boosting = input.boosting;
    const boost = this.boosting ? BOOST_MULTIPLIER : 1;
    const sightseeing = this.mode === 'sightseeing';
    // Use the full Normal chart's elapsed gates as a successful-run pace reference.
    // Compare against the previous tick, as Standard's pass count is updated after movement.
    while (this.referenceBeats[this.referenceProgress] <= previousBeat + 1e-9) this.referenceProgress++;
    const speedProgress = sightseeing ? this.referenceProgress : this.gatesPassed;
    const cruiseTarget = CRUISE_SPEED + Math.min(speedProgress * 0.22, SPEED_BONUS);
    const speedScale = sightseeing ? SIGHTSEEING_SPEED : 1;
    const speedDamping = Math.min(1, elapsed * (boost > 1 ? 4 : 1.6));
    this.speed += (cruiseTarget * boost * speedScale - this.speed) * speedDamping;
    this.cruiseSpeed += (cruiseTarget * speedScale - this.cruiseSpeed) * speedDamping;
    this.boostLens += ((this.boosting ? 1 : 0) - this.boostLens) * -Math.expm1(-elapsed / BOOST_LENS_SECONDS);
    this.distance += this.speed * elapsed;
    this.score += this.speed * elapsed * 0.35;

    const width = this.steeringWidth;
    const { x, y } = camera;
    if (width < previousWidth) {
      // Transfer the expanded position into the ordinary tunnel without snapping at the portal.
      const limit = SECTION.a - 0.34;
      const scale = (limit + width) / (limit + previousWidth);
      camera.x *= scale;
      camera.tx *= scale;
    }
    [camera.tx, camera.ty] = steer(input, camera.tx, camera.ty, dt, width);
    const next = this.chart[this.judged];
    if (this.options.align && next) {
      if (this.branch && !this.branch.side && next.beat >= REJOIN_BEAT) {
        const side = this.options.branchSide;
        const aim = Math.min(SECTION.a - 0.34 + width, BRANCH_SIDE_THRESHOLD + 0.65);
        [camera.tx, camera.ty] = [side === 'left' ? -aim : side === 'right' ? aim : 0, 0];
      } else if (next.beat <= this.beat + 9) {
        [camera.tx, camera.ty] = lanePoint(next.kind, next.open, next.axis);
      }
    }
    const damp = 1 - Math.exp(-dt * 20);
    camera.x += (camera.tx - camera.x) * damp;
    camera.y += (camera.ty - camera.y) * damp;
    camera.roll += (-camera.x * 0.028 * (SECTION.a / (SECTION.a + width)) - camera.roll) * (1 - Math.exp(-dt * 8));

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
        const route = this.branch.layout[side];
        const gates = this.branchGates![route];
        this.chart.splice(this.judged, 0, ...gates);
        const reference = this.referenceRoutes?.[route];
        if (reference) this.referenceBeats.splice(this.referenceProgress, 0, ...reference.map(gate => gate.beat));
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
      gate.trackPosition = previousTrack + (this.trackDistance - previousTrack) * fraction;
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
