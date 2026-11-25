import type { Difficulty, PlayMode, RunResult } from '../contracts';
import { branchLayout, BRANCH_SIDE_THRESHOLD, ROUTE_GATE_MULTIPLIERS, routeSides, selectSide } from './branches';
import type { BranchRun, RouteKind, RouteSide } from './branches';
import { difficultySettings } from './chart';
import type { ChartGate } from './chart';
import { canPass, clamp, lanePoint, SECTION } from './collision';
import { resolveDifficulty } from './difficulty';
import { CLEAN_RADIUS, makeOutroPlan, outroPhase, recordEncore } from './encore';
import type { EncoreGate, EncoreResult, OutroPlan } from './encore';
import { daylightFade, daylightPeak, elsewhereEscapeFade, gameplayFor } from './gameplay';
import { steer, steeringDamping } from './input';
import type { InputFrame } from './input';
import { LUMEN_POINTS, pickupForSeed, RESONANCE_BONUS, RESONANCE_CHARGES } from './pickups';
import type { RunPickup } from './pickups';
import { projectRunChart } from './run-chart';
import type { RunGate } from './run-chart';
import { CAPTURE_RUN_SEED } from './run-seed';
import { BOOST_MULTIPLIER, CRUISE_RESPONSE, CRUISE_SPEED, cruiseTarget, modeScale,
  referenceFor, START_DISTANCE } from './reference-track';
import { SIGHTSEEING_LIVES, SIGHTSEEING_SPEED } from './sightseeing';
import { sectionAt } from './volumes';
import type { VolumeDefinition } from './volumes';
import { BranchPath } from '../graphics/branch-path';
import { buildRunPath } from '../graphics/path';
import type { Path } from '../graphics/path';

export { START_DISTANCE } from './reference-track';
export { corridorLength } from './corridor-composition';
export type { RunGate } from './run-chart';
const MENU_DISTANCE = START_DISTANCE + 140;
const BOOST_LENS_SECONDS = 0.18;
export const GATE_LOAD_AHEAD = 210;
const GATE_ALIGN_AHEAD = 145;
export const GATE_RELEASE_BEHIND = 8;
const STATION_EPSILON = 1e-8;
const RESULTS_SETTLE_SECONDS = .7;
const DESCENT_COAST_SECONDS = 1.05;

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
  previewEncore: EncoreGate[] = [];
  outroPlan?: OutroPlan;
  encore?: EncoreResult;
  private encoreCursor = 0;
  private encoreReveal = 0;
  private authored: readonly Readonly<ChartGate>[] = [];
  private chart: RunGate[] = [];
  private reveal = 0;
  private judged = 0;
  private invulnUntil = 0;
  private settleAt = 0;
  private daylightReleasedAt?: number;
  private escapedAt = 0;
  private recoil = 0;
  private settleSpeed = 0;
  private messageUntil = 0;
  private mult = 1;
  private scoring = true;
  private runDifficulty: Difficulty = 'normal';
  private speedFactor = 1;
  private playMode: PlayMode;
  private readonly paths = new Map<PlayMode | 'impossible', Path>();
  private track;
  readonly gameplay;
  private readonly junctions = new WeakMap<Path, BranchPath>();
  private suffixBySide?: Record<RouteSide, RunGate[]>;
  private referenceProgress = 0;
  readonly secondsPerBeat: number;

  constructor(
    readonly volume: VolumeDefinition,
    private readonly options: { align?: boolean; god?: boolean; branchSide?: RouteSide } = {},
    path?: Path,
    mode: PlayMode = 'standard',
    initialDifficulty: Difficulty = 'normal',
  ) {
    this.playMode = mode;
    this.gameplay = gameplayFor(volume.id);
    this.track = referenceFor(volume, mode === 'standard' ? initialDifficulty : 'normal');
    if (path) this.paths.set(this.pathKey, path);
    this.secondsPerBeat = 60 / volume.bpm;
  }

  get gatesTotal() { return this.chart.length + (this.branch && !this.branch.side ? this.branchGates!.main.length : 0); }
  get authoredGates() { return this.authored; }
  get mainGates(): readonly RunGate[] { return this.chart; }
  get gateLoadAhead() { return this.gameplay.gateLoadAhead ?? GATE_LOAD_AHEAD * modeScale(this.mode); }
  get outroPhase() {
    const phase = outroPhase(this.outroPlan, this.trackDistance, this.mainComplete);
    if (this.volume.id === 'orbit' && (phase === 'transition' || phase === 'encore')) {
      const next = this.outroPlan!.gates[this.encoreCursor];
      // Skip the unused Encore space once even full Boost cannot reach the next gate.
      if (next && next.routeStation > this.distance + this.remainingBoostTravel + STATION_EPSILON) return 'afterglow';
    }
    return phase;
  }
  private get mainComplete() { return this.lives > 0 && this.judged === this.chart.length && (!this.branch || !!this.branch.side); }
  private get remainingBoostTravel() {
    const speedCap = cruiseTarget(Infinity) * BOOST_MULTIPLIER * modeScale(this.mode) * this.speedFactor;
    return (this.volume.beats - this.beat) * this.secondsPerBeat * speedCap;
  }
  get escapeWhite() {
    if (this.volume.id === 'orbit') return 0;
    const ending = this.gameplay.ending;
    if (!ending) return this.phase === 'playing' || this.phase === 'crash' ? elsewhereEscapeFade(this.beat, this.volume.beats) : 0;
    const duration = ending.beats;
    const elapsed = this.beat - (this.volume.beats - duration);
    if (this.result?.title === 'TERMINATED' || this.phase === 'menu') return 0;
    if (elapsed < 1e-9) return 0;
    const seconds = duration * this.secondsPerBeat;
    if (this.result?.title !== 'ESCAPED') return daylightFade(elapsed * this.secondsPerBeat, seconds, this.daylightReleasedAt, ending.ambient);
    const sinceCue = seconds + this.time - this.escapedAt;
    const releasedAt = this.daylightReleasedAt!;
    const fade = Math.exp(-Math.max(0, sinceCue - daylightPeak(seconds, releasedAt) - .12) * 3.8);
    return daylightFade(sinceCue, seconds, releasedAt, ending.ambient) * fade;
  }
  get mode() { return this.playMode; }
  get difficulty() { return this.runDifficulty; }
  get modeSpecificPath() { return !!(this.gameplay.branch || this.gameplay.world?.modePath); }
  get reference() { return this.track; }
  private get pathMode() { return this.modeSpecificPath ? this.mode : 'standard'; }
  private get pathKey() { return this.track.scale > 1 ? 'impossible' : this.pathMode; }
  get path() {
    const key = this.pathKey;
    let path = this.paths.get(key);
    if (!path) {
      path = buildRunPath(this.volume, this.pathMode, this.track);
      this.paths.set(key, path);
    }
    return path;
  }
  get route() { return this.branch?.side ? this.branch.layout[this.branch.side] : null; }
  get routeGuide() {
    const path = this.junctionPath;
    return this.phase === 'playing' && path && this.trackDistance >= path.guideStart && this.trackDistance < path.guideEnd
      ? this.branch?.layout ?? null : null;
  }
  get routeSide() {
    return this.routeGuide ? this.branch?.side ?? selectSide(this.camera.x, this.gameplay.branch?.sideThreshold) : null;
  }
  get steeringWidth() { return this.junctionPath?.steeringWidth(this.trackDistance) ?? 0; }
  get trackDistance() {
    return this.branch?.side ? this.junctionPath!.stationAt(this.distance, this.branch.side) : this.distance;
  }
  get pickupVisible() {
    return this.pickup?.status === 'pending' && this.trackDistance >= this.pickupPreviewStation;
  }
  get section() { return sectionAt(this.volume, this.beat)?.name ?? this.volume.sections.at(-1)!.name; }
  get progress() { return this.beat / this.volume.beats; }

  start(difficulty: Difficulty, runSeed = CAPTURE_RUN_SEED, pickupKind = pickupForSeed(runSeed), mode: PlayMode = 'standard', scoring = true) {
    if (this.phase !== 'menu' && this.phase !== 'results') return false;
    this.playMode = mode;
    this.scoring = scoring;
    const sightseeing = mode === 'sightseeing';
    difficulty = sightseeing ? 'normal' : resolveDifficulty(this.volume.id, difficulty);
    this.track = referenceFor(this.volume, difficulty);
    const rules = difficultySettings(this.volume, difficulty);
    const station = (beat: number) => this.reference.station(beat, mode);
    const { branch, pickup, encore } = this.gameplay;
    this.branch = branch ? { layout: branchLayout(runSeed), side: null } : null;
    if (branch) {
      const base = this.path;
      let path = this.junctions.get(base);
      if (!path) {
        path = new BranchPath(base, this.reference, mode, branch);
        this.junctions.set(base, path);
      }
      this.junctionPath = path;
    }
    const junction = this.junctionPath;
    const projected = projectRunChart(this.volume, { difficulty, chartSeed: rules.seed, mode, reference: this.reference },
      junction && this.branch ? { path: junction, layout: this.branch.layout } : undefined);
    this.authored = projected.authored;
    this.chart = projected.mainGates;
    this.branchGates = projected.branchGates;
    this.suffixBySide = projected.suffixBySide;
    this.referenceProgress = 0;
    this.phase = 'playing';
    this.time = this.beat = this.score = this.combo = this.maxCombo = 0;
    this.daylightReleasedAt = undefined;
    this.gatesPassed = this.gatesJudged = this.gatesNeutralized = this.hits = this.reveal = this.judged = 0;
    this.invulnUntil = this.settleAt = this.recoil = this.messageUntil = 0;
    this.previewGates = [];
    this.previewEncore = [];
    this.encore = undefined;
    this.encoreCursor = this.encoreReveal = 0;
    const last = Math.max(this.chart.at(-1)?.worldStation ?? START_DISTANCE, this.branchGates?.main.at(-1)?.worldStation ?? START_DISTANCE);
    this.outroPlan = encore ? makeOutroPlan(this.volume, mode, runSeed, last,
      difficulty, junction && encore !== 'legacy' ? seconds => Math.min(...routeSides.map(side =>
        this.reference.boostAt(seconds, mode, rules.speedFactor, arc => junction.stationAt(arc, side)))) : undefined) : undefined;
    this.runDifficulty = difficulty;
    this.speedFactor = rules.speedFactor;
    this.pickup = pickup ? { kind: pickupKind, status: 'pending' } : null;
    this.pickupStation = pickup ? station(pickup.beat) : Infinity;
    this.pickupPreviewStation = pickup ? station(pickup.preview) : Infinity;
    this.pickupTime = -Infinity;
    this.shield = false;
    this.resonance = 0;
    this.lives = this.maxLives = sightseeing ? SIGHTSEEING_LIVES : rules.lives;
    this.mult = rules.mult;
    this.distance = START_DISTANCE;
    this.speed = CRUISE_SPEED * (sightseeing ? SIGHTSEEING_SPEED : this.speedFactor);
    this.boosting = false;
    this.boostLens = 0;
    this.settleSpeed = 3;
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
    this.previewEncore = [];
    this.outroPlan = undefined;
    this.encore = undefined;
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
    this.authored = [];
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
    if (this.phase === 'results' || (this.phase === 'crash' && this.volume.id === 'descent' && this.result?.title === 'ESCAPED')) {
      if (!this.gameplay.world?.settleResults) {
        this.distance += 3 * dt;
        return;
      }
      const coast = this.volume.id === 'descent' && this.result?.title === 'ESCAPED' ? DESCENT_COAST_SECONDS : 3;
      const decay = -Math.expm1(-dt / coast);
      this.distance = Math.min(this.path.length - 440, this.distance + this.settleSpeed * coast * decay);
      this.settleSpeed *= 1 - decay;
      camera.x *= 1 - decay;
      camera.y *= 1 - decay;
      camera.roll *= 1 - decay;
      if (this.phase === 'crash' && this.time + 1e-9 >= this.settleAt) this.phase = 'results';
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
    const targetSpeed = cruiseTarget(this.referenceProgress) * boost * modeScale(this.mode) * this.speedFactor;
    this.speed += (targetSpeed - this.speed) * Math.min(1, elapsed * (boost > 1 ? 4 : CRUISE_RESPONSE));
    this.boostLens += ((this.boosting ? 1 : 0) - this.boostLens) * -Math.expm1(-elapsed / BOOST_LENS_SECONDS);
    this.distance += this.speed * elapsed;
    if (this.scoring) this.score += this.speed * elapsed * 0.35;

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
    const next = this.chart[this.judged] ?? (this.mainComplete ? this.outroPlan?.gates[this.encoreCursor] : undefined);
    if (this.options.align) {
      if (this.branch && !this.branch.side && this.routeGuide && (!next || next.worldStation >= this.junctionPath!.end)) {
        const side = this.options.branchSide;
        const aim = Math.min(SECTION.a - 0.34 + width, BRANCH_SIDE_THRESHOLD + 0.65);
        [camera.tx, camera.ty] = [side === 'left' ? -aim : side === 'right' ? aim : 0, 0];
      } else if (next && next.routeStation <= this.distance + GATE_ALIGN_AHEAD * modeScale(this.mode)) {
        [camera.tx, camera.ty] = lanePoint(next.kind, next.open, next.axis);
      }
    }
    const damp = steeringDamping(dt);
    camera.x += (camera.tx - camera.x) * damp;
    camera.y += (camera.ty - camera.y) * damp;
    camera.roll += (-camera.x * 0.028 * (SECTION.a / (SECTION.a + width)) - camera.roll) * (1 - Math.exp(-dt * 8));

    const travel = this.distance - previousDistance;
    while (travel > 0) {
      const gate = this.chart[this.judged];
      const encore = this.mainComplete ? this.outroPlan?.gates[this.encoreCursor] : undefined;
      const pickup = this.pickup?.status === 'pending'
        ? this.junctionPath?.arcAt(this.pickupStation, this.branch?.side ?? 'center') ?? this.pickupStation : Infinity;
      const split = this.branch && !this.branch.side ? this.junctionPath!.split : Infinity;
      const station = Math.min(gate?.routeStation ?? Infinity, pickup, split, encore?.routeStation ?? Infinity);
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
        this.chooseRoute(selectSide(localX, this.gameplay.branch?.sideThreshold));
        continue;
      }
      if (encore && station === encore.routeStation) {
        this.encoreCursor++;
        this.judgeEncore(encore, localX, localY, tickStart + elapsed * fraction, neutralize);
        continue;
      }
      this.judged++;
      this.judge(gate, localX, localY, tickStart + elapsed * fraction, neutralize);
      if (this.outroPlan && this.mainComplete && this.beat + 1e-9 < this.volume.beats) {
        this.message = this.outroPlan.gates.length ? 'MAIN COMPLETE · ENCORE AHEAD' : 'MAIN COMPLETE';
        this.messageUntil = this.time + 1.3;
      }
      if (this.lives === 0) {
        if (this.scoring) this.score -= Math.max(0, this.distance - station) * 0.35;
        this.distance = station;
        this.beat = previousBeat + (this.beat - previousBeat) * fraction;
        this.finish('TERMINATED');
        break;
      }
    }
    this.preloadGates();
    while (this.previewGates[0]?.routeStation < this.distance - GATE_RELEASE_BEHIND) this.previewGates.shift();
    while (this.previewEncore[0]?.routeStation < this.distance - GATE_RELEASE_BEHIND) this.previewEncore.shift();
    if (this.phase === 'playing') {
      this.releaseDaylight(previousBeat);
      if (this.beat + 1e-9 >= this.volume.beats) {
        this.beat = this.volume.beats;
        this.finish('ESCAPED');
      }
    }
  }

  private releaseDaylight(previousBeat: number) {
    const ending = this.gameplay.ending;
    if (!ending || this.daylightReleasedAt !== undefined) return;
    const start = this.volume.beats - ending.beats;
    if (this.beat - start < 1e-9) return;
    const next = this.chart[this.judged] ?? (this.mainComplete ? this.outroPlan?.gates[this.encoreCursor] : undefined);
    // Once no gate can be reached even with Boost, the final rise can run to completion.
    if (ending.protectGates && next && next.routeStation <= this.distance + this.remainingBoostTravel + STATION_EPSILON) return;
    this.daylightReleasedAt = previousBeat - start < 1e-9 ? 0 : (this.beat - start) * this.secondsPerBeat;
  }

  private chooseRoute(side: RouteSide) {
    const { layout } = this.branch!;
    this.branch = { layout, side };
    this.chart.splice(this.judged, this.chart.length - this.judged,
      ...this.branchGates![layout[side]], ...this.suffixBySide![side]);
    this.previewGates = this.previewGates.filter(gate => gate.worldStation < this.junctionPath!.end);
    this.reveal = Math.min(this.reveal, this.judged);
    for (const gate of this.outroPlan?.gates ?? []) gate.routeStation = this.junctionPath!.arcAt(gate.worldStation, side);
  }

  private resolvePickup(pickup: RunPickup, x: number, y: number) {
    const spec = this.gameplay.pickup!;
    if (Math.hypot(x - spec.x, y - spec.y) > spec.radius) {
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
    } else if (this.scoring) {
      const points = LUMEN_POINTS[this.difficulty];
      this.score += points;
      this.message = 'LUMEN +' + points;
    }
    this.messageUntil = this.time + 1.1;
  }

  private preloadGates() {
    // Give Graphics time to stage gate meshes before they start to fade in.
    const through = this.distance + this.gateLoadAhead;
    while (this.chart[this.reveal]?.routeStation <= through) {
      this.previewGates.push(this.chart[this.reveal++]);
    }
    const encore = !this.branch || this.branch.side ? this.outroPlan?.gates : undefined;
    while (encore && encore[this.encoreReveal]?.routeStation <= through) {
      this.previewEncore.push(encore[this.encoreReveal++]);
    }
  }

  private judgeEncore(gate: EncoreGate, x: number, y: number, crossingTime: number, neutralize: boolean) {
    gate.judged = true;
    gate.crossedAt = crossingTime;
    gate.neutralized = neutralize;
    gate.passed = !neutralize && (this.options.god === true || canPass(gate.kind, gate.open, gate.axis, x, y));
    const [lx, ly] = lanePoint(gate.kind, gate.open, gate.axis);
    gate.clean = gate.passed && Math.hypot(x - lx, y - ly) < CLEAN_RADIUS;
    this.encore = recordEncore(gate, this.encore, this.scoring);
    if (this.scoring && gate.passed) {
      this.message = gate.clean ? 'ENCORE CLEAN +300' : 'ENCORE +200';
      this.messageUntil = this.time + .65;
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
      if (this.scoring) this.score += gatePoints;
      let cleanPoints = 0;
      if (Math.hypot(x - lx, y - ly) < CLEAN_RADIUS) {
        cleanPoints = 150 * this.mult * routeMult;
        if (this.scoring) {
          this.score += cleanPoints;
          this.message = 'CLEAN ×' + this.combo;
          this.messageUntil = this.time + 0.6;
        }
      }
      if (this.resonance > 0) {
        if (this.scoring) this.score += (gatePoints + cleanPoints) * RESONANCE_BONUS;
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
      unreached: planned - this.gatesJudged, neutralized: this.gatesNeutralized, ...(this.route ? { route: this.route } : {}),
      ...(this.encore ? { encore: this.encore } : {}) });
    this.phase = 'crash';
    this.settleAt = this.time + RESULTS_SETTLE_SECONDS;
    if (title === 'ESCAPED' && this.volume.id === 'descent') {
      this.settleAt = this.time + (this.volume.soundtrack?.tail ?? RESULTS_SETTLE_SECONDS);
      const next = this.chart[this.judged] ?? this.outroPlan?.gates[this.encoreCursor];
      const coastRoom = Math.max(0, (next?.routeStation ?? Infinity) - this.distance - 4);
      this.settleSpeed = Math.min(this.speed, coastRoom / DESCENT_COAST_SECONDS);
    }
    if (title === 'ESCAPED' && this.gameplay.ending) {
      const duration = this.gameplay.ending.beats * this.secondsPerBeat;
      this.daylightReleasedAt ??= duration;
      this.escapedAt = this.time;
      // DESCENT's audio tail already gives a late rise time to reach its peak.
      if (this.volume.id !== 'descent') this.settleAt += daylightPeak(duration, this.daylightReleasedAt) - duration;
    }
    if (title === 'ESCAPED' && !this.scoring) {
      this.settleAt = Math.max(this.settleAt, this.time + (this.volume.soundtrack?.tail ?? 0));
    }
    this.recoil = title === 'ESCAPED' ? 0 : 0.55;
    this.boosting = false;
    this.shield = false;
    this.resonance = 0;
  }
}
