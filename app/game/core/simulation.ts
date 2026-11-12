import type { Difficulty, PlayMode, RunResult } from '../contracts';
import { branchLayout, BRANCH_SIDE_THRESHOLD, REJOIN_BEAT,
  ROUTE_GATE_MULTIPLIERS, routeCharts, selectSide, SPLIT_BEAT } from './branches';
import type { BranchRun, RouteKind, RouteSide } from './branches';
import { chartFor, difficultySettings } from './chart';
import type { ChartGate } from './chart';
import { canPass, clamp, lanePoint, opening, SECTION } from './collision';
import type { Axis } from './collision';
import { steer } from './input';
import type { InputFrame } from './input';
import { LUMEN_POINTS, PICKUP_APPEAR_BEAT, PICKUP_BEAT, PICKUP_LOCAL_X, PICKUP_LOCAL_Y, PICKUP_RADIUS,
  pickupForSeed, RESONANCE_BONUS, RESONANCE_CHARGES } from './pickups';
import type { RunPickup } from './pickups';
import { CAPTURE_RUN_SEED } from './run-seed';
import { BOOST_MULTIPLIER, CRUISE_RESPONSE, CRUISE_SPEED, cruiseTarget, modeScale,
  referenceFor, SPEED_BONUS, START_DISTANCE } from './reference-track';
import { sightseeingChart, sightseeingRoute, SIGHTSEEING_LIVES, SIGHTSEEING_SPEED } from './sightseeing';
import { sectionAt } from './volumes';
import type { GateKind, VolumeDefinition } from './volumes';
import { BranchPath } from '../graphics/branch-path';
import { buildPath } from '../graphics/path';
import type { Path } from '../graphics/path';

export { START_DISTANCE } from './reference-track';
const MENU_DISTANCE = START_DISTANCE + 140;
const BOOST_LENS_SECONDS = 0.18;
export const GATE_LOAD_AHEAD = 210;
const GATE_ALIGN_AHEAD = 145;
const GATE_RELEASE_BEHIND = 8;
const STATION_EPSILON = 1e-8;

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
  readonly worldStation: number;
  readonly routeStation: number;
  judged: boolean;
  hit: boolean;
  crossedAt?: number;
  neutralizedByRecovery?: true;
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
  gatesNeutralized = 0;
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
  junctionPath?: BranchPath;
  pickupStation = Infinity;
  pickupPreviewStation = Infinity;
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
  readonly reference;
  private readonly junctions = new Map<PlayMode, BranchPath>();
  private suffixBySide?: Record<RouteSide, RunGate[]>;
  private referenceProgress = 0;
  readonly secondsPerBeat: number;

  constructor(
    readonly volume: VolumeDefinition,
    private readonly options: { align?: boolean; god?: boolean; branchSide?: RouteSide } = {},
    private worldPath?: Path,
  ) {
    this.secondsPerBeat = 60 / volume.bpm;
    this.reference = referenceFor(volume);
  }

  get gatesTotal() { return this.chart.length + (this.branch && !this.branch.side ? this.branchGates!.main.length : 0); }
  get mode() { return this.playMode; }
  get route() { return this.branch?.side ? this.branch.layout[this.branch.side] : null; }
  get routeGuide() {
    const path = this.junctionPath;
    return this.phase === 'playing' && path && this.trackDistance >= path.guideStart && this.trackDistance < path.guideEnd
      ? this.branch?.layout ?? null : null;
  }
  get routeSide() { return this.routeGuide ? this.branch?.side ?? selectSide(this.camera.x) : null; }
  get steeringWidth() { return this.junctionPath?.steeringWidth(this.trackDistance) ?? 0; }
  get trackDistance() {
    return this.branch?.side ? this.junctionPath!.stationAt(this.distance, this.branch.side) : this.distance;
  }
  get pickupVisible() {
    return this.pickup?.status === 'pending' && this.distance >= this.pickupPreviewStation;
  }
  get section() { return sectionAt(this.volume, this.beat)?.name ?? this.volume.sections.at(-1)!.name; }
  get progress() { return this.beat / this.volume.beats; }

  start(difficulty: Difficulty, runSeed = CAPTURE_RUN_SEED, pickupKind = pickupForSeed(runSeed), mode: PlayMode = 'standard') {
    if (this.phase !== 'menu' && this.phase !== 'results') return false;
    this.playMode = mode;
    const sightseeing = mode === 'sightseeing';
    if (sightseeing) difficulty = 'normal';
    const rules = difficultySettings(this.volume, difficulty);
    let rng = 987654321;
    const station = (beat: number) => this.reference.station(beat, mode);
    const makeGate = ({ beat, kind, sector }: ChartGate, axis: Axis, route?: RouteKind, side: RouteSide = 'center'): RunGate => {
      const worldStation = station(beat);
      return { beat, kind, open: opening(kind, sector), axis, worldStation,
        routeStation: this.junctionPath?.arcAt(worldStation, side) ?? worldStation,
        judged: false, hit: false, ...(route ? { route } : {}) };
    };
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
    this.branch = elsewhere ? { layout: branchLayout(runSeed), side: null } : null;
    if (elsewhere) {
      let path = this.junctions.get(mode);
      if (!path) {
        this.worldPath ??= buildPath(corridorLength(this.volume), 150, 46, this.volume.topology);
        path = new BranchPath(this.worldPath, this.reference, mode);
        this.junctions.set(mode, path);
      }
      this.junctionPath = path;
      const { left, right } = this.branch!.layout;
      const sideFor = (route: RouteKind): RouteSide => left === route ? 'left' : right === route ? 'right' : 'center';
      const { main, challenge, score } = routeCharts(authored.filter(gate => gate.beat >= SPLIT_BEAT && gate.beat < REJOIN_BEAT));
      this.branchGates = {
        main: main.map(gate => makeGate(gate, 0, 'main')),
        challenge: challenge.map(gate => makeGate(gate, 0, 'challenge', sideFor('challenge'))),
        score: score.map(gate => makeGate(gate, 0, 'score', sideFor('score'))),
      };
      this.chart = gates.filter(gate => gate.beat < SPLIT_BEAT || gate.beat >= REJOIN_BEAT);
    } else {
      this.branchGates = null;
      this.chart = gates;
    }
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
    if (this.junctionPath) {
      const path = this.junctionPath;
      const center = this.chart.filter(gate => gate.worldStation >= path.end);
      this.suffixBySide = {
        center,
        left: center.map(gate => ({ ...gate, routeStation: path.arcAt(gate.worldStation, 'left') })),
        right: center.map(gate => ({ ...gate, routeStation: path.arcAt(gate.worldStation, 'right') })),
      };
    }
    this.phase = 'playing';
    this.time = this.beat = this.score = this.combo = this.maxCombo = 0;
    this.gatesPassed = this.gatesJudged = this.gatesNeutralized = this.hits = this.reveal = this.judged = 0;
    this.invulnUntil = this.settleAt = this.recoil = this.messageUntil = 0;
    this.previewGates = [];
    this.difficulty = difficulty;
    this.pickup = elsewhere ? { kind: pickupKind, status: 'pending' } : null;
    this.pickupStation = elsewhere ? station(PICKUP_BEAT) : Infinity;
    this.pickupPreviewStation = elsewhere ? station(PICKUP_APPEAR_BEAT) : Infinity;
    this.pickupTime = -Infinity;
    this.shield = false;
    this.resonance = 0;
    this.lives = this.maxLives = sightseeing ? SIGHTSEEING_LIVES : rules.lives;
    this.mult = rules.mult;
    this.distance = START_DISTANCE;
    this.speed = CRUISE_SPEED * (sightseeing ? SIGHTSEEING_SPEED : 1);
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
    this.junctionPath = undefined;
    this.suffixBySide = undefined;
    this.message = '';
  }

  step(dt: number, input: InputFrame, neutralize = false) {
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
    const tickStart = this.time - dt;
    this.beat = Math.min(this.volume.beats, this.beat + dt / this.secondsPerBeat);
    const elapsed = (this.beat - previousBeat) * this.secondsPerBeat;
    this.boosting = input.boosting;
    const boost = this.boosting ? BOOST_MULTIPLIER : 1;
    this.referenceProgress = this.reference.countThrough(this.trackDistance, this.mode, this.referenceProgress);
    const targetSpeed = cruiseTarget(this.referenceProgress) * boost * modeScale(this.mode);
    this.speed += (targetSpeed - this.speed) * Math.min(1, elapsed * (boost > 1 ? 4 : CRUISE_RESPONSE));
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
    if (this.options.align) {
      if (this.branch && !this.branch.side && this.routeGuide && (!next || next.worldStation >= this.junctionPath!.end)) {
        const side = this.options.branchSide;
        const aim = Math.min(SECTION.a - 0.34 + width, BRANCH_SIDE_THRESHOLD + 0.65);
        [camera.tx, camera.ty] = [side === 'left' ? -aim : side === 'right' ? aim : 0, 0];
      } else if (next && next.routeStation <= this.distance + GATE_ALIGN_AHEAD * modeScale(this.mode)) {
        [camera.tx, camera.ty] = lanePoint(next.kind, next.open, next.axis);
      }
    }
    const damp = 1 - Math.exp(-dt * 20);
    camera.x += (camera.tx - camera.x) * damp;
    camera.y += (camera.ty - camera.y) * damp;
    camera.roll += (-camera.x * 0.028 * (SECTION.a / (SECTION.a + width)) - camera.roll) * (1 - Math.exp(-dt * 8));

    const travel = this.distance - previousDistance;
    while (travel > 0) {
      const gate = this.chart[this.judged];
      const pickup = this.pickup?.status === 'pending' ? this.pickupStation : Infinity;
      const split = this.branch && !this.branch.side ? this.junctionPath!.split : Infinity;
      const station = Math.min(gate?.routeStation ?? Infinity, pickup, split);
      // The cursor consumes each event once, including the inclusive end of the tick.
      if (!(previousDistance < station && station <= this.distance + STATION_EPSILON)) break;
      const fraction = clamp((station - previousDistance) / travel, 0, 1);
      const localX = x + (camera.x - x) * fraction;
      const localY = y + (camera.y - y) * fraction;
      if (station === pickup) {
        this.resolvePickup(this.pickup!, localX, localY);
        continue;
      }
      if (station === split) {
        this.chooseRoute(selectSide(localX));
        continue;
      }
      this.judged++;
      this.judge(gate, localX, localY, tickStart + elapsed * fraction, neutralize);
      if (this.lives === 0) {
        this.score -= Math.max(0, this.distance - station) * 0.35;
        this.distance = station;
        this.beat = previousBeat + (this.beat - previousBeat) * fraction;
        this.finish('TERMINATED');
        break;
      }
    }
    this.preloadGates();
    while (this.previewGates[0]?.routeStation < this.distance - GATE_RELEASE_BEHIND) this.previewGates.shift();
    if (this.phase === 'playing' && this.beat + 1e-9 >= this.volume.beats) {
      this.beat = this.volume.beats;
      this.finish('ESCAPED');
    }
  }

  private chooseRoute(side: RouteSide) {
    const { layout } = this.branch!;
    this.branch = { layout, side };
    this.chart.splice(this.judged, this.chart.length - this.judged,
      ...this.branchGates![layout[side]], ...this.suffixBySide![side]);
    this.previewGates = this.previewGates.filter(gate => gate.worldStation < this.junctionPath!.end);
    this.reveal = Math.min(this.reveal, this.judged);
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
    const through = this.distance + GATE_LOAD_AHEAD * modeScale(this.mode);
    while (this.chart[this.reveal]?.routeStation <= through) {
      this.previewGates.push(this.chart[this.reveal++]);
    }
  }

  private judge(gate: RunGate, x: number, y: number, crossingTime: number, neutralize: boolean) {
    gate.judged = true;
    gate.crossedAt = crossingTime;
    this.gatesJudged++;
    if (neutralize) {
      gate.neutralizedByRecovery = true;
      this.gatesNeutralized++;
      return;
    }
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
      if (crossingTime >= this.invulnUntil) {
        this.invulnUntil = crossingTime + 1.4;
        if (this.shield) {
          this.shield = false;
          return;
        }
        this.lives--;
        this.hits++;
        this.hitTime = crossingTime;
        gate.hit = true;
      }
    }
  }

  private finish(title: RunResult['title']) {
    const planned = this.gatesTotal;
    const accuracy = planned ? this.gatesPassed / planned : 0;
    const rank = this.lives > 0
      ? accuracy >= 0.985 ? 'S' : accuracy >= 0.93 ? 'A' : accuracy >= 0.82 ? 'B' : 'C'
      : accuracy >= 0.93 ? 'B' : 'C';
    this.result = Object.freeze({ title, accuracy, rank, planned, encountered: this.gatesJudged, passed: this.gatesPassed,
      unreached: planned - this.gatesJudged, neutralized: this.gatesNeutralized, ...(this.route ? { route: this.route } : {}) });
    this.phase = 'crash';
    this.settleAt = this.time + 0.7;
    this.recoil = title === 'ESCAPED' ? 0 : 0.55;
    this.boosting = false;
    this.shield = false;
    this.resonance = 0;
  }
}
