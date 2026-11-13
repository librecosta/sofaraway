import { initialSnapshot } from '../contracts';
import type { GameSnapshot, PlayMode } from '../contracts';
import type { RouteKind, RouteSide } from '../core/branches';
import { clamp } from '../core/collision';
import { STEP } from '../core/clock';
import { idleInput } from '../core/input';
import { ENCORE_GATE_COUNT } from '../core/encore';
import type { EncoreGate, OutroPlan } from '../core/encore';
import type { SceneState } from '../graphics/scene.client';
import { BOOST_MULTIPLIER, cruiseTarget, modeScale } from '../core/reference-track';
import { GATE_LOAD_AHEAD, GATE_RELEASE_BEHIND, Simulation } from '../core/simulation';
import type { RunGate } from '../core/simulation';
import { volumeById } from '../core/volumes';

export const outroVolume = volumeById('elsewhere');
export const outroPresets = [
  ['main-last', 'Main Last Gate'], ['transition', 'Transition'],
  ['encore-first', 'Encore First Gate'], ['encore-middle', 'Encore Middle'], ['encore-final', 'Encore Final Gate'],
  ['afterglow-entry', 'Afterglow Entry'], ['afterglow-peak', 'Afterglow Peak'], ['music-end', 'Music End'],
] as const;
export type OutroPreset = typeof outroPresets[number][0];
export const movements = ['Paused', 'Cruise', 'Boost'] as const;
export type OutroMovement = typeof movements[number];
const gatePresets: Partial<Record<OutroPreset, number>> = { 'encore-first': 0, 'encore-middle': 11, 'encore-final': ENCORE_GATE_COUNT - 1 };

export function outroView(plan: OutroPlan, preset: OutroPreset) {
  const peek = 22 * modeScale(plan.mode);
  const index = gatePresets[preset];
  const gate = index === undefined ? undefined : plan.gates[index];
  if (gate) return { station: gate.worldStation - peek, gate };
  const peak = plan.afterglow[2];
  const positions = {
    'main-last': plan.mainLastStation - peek,
    transition: (plan.mainLastStation + plan.transitionEnd) / 2,
    'afterglow-entry': plan.afterglowStart,
    'afterglow-peak': (peak.start + peak.end) / 2,
    'music-end': plan.musicEndStation,
  };
  return { station: positions[preset as keyof typeof positions] ?? plan.afterglowStart };
}

export class OutroInspection {
  readonly sim: Simulation;
  readonly plan: OutroPlan;
  private readonly side: RouteSide;
  private readonly main: RunGate[];
  private readonly encore: EncoreGate[];
  readonly min: number;
  readonly max: number;

  constructor(mode: PlayMode, seed: number, private readonly route: RouteKind, path?: Simulation['path']) {
    this.sim = new Simulation(outroVolume, {}, path, mode);
    this.sim.start('normal', seed, undefined, mode);
    this.plan = this.sim.outroPlan!;
    const { layout } = this.sim.branch!;
    this.side = route === 'main' ? 'center' : layout.left === route ? 'left' : 'right';
    const routeStation = (station: number) => this.sim.junctionPath!.arcAt(station, this.side);
    this.main = this.sim.mainGates.map(gate => ({ ...gate, routeStation: routeStation(gate.worldStation) }));
    this.encore = this.plan.gates.map(gate => ({ ...gate, routeStation: routeStation(gate.worldStation) }));
    this.min = this.plan.mainLastStation - 160 * modeScale(mode);
    this.max = Math.min(this.plan.afterglowEnd, this.sim.path.length - 430);
  }

  state(station: number, musicBeat: number, movement: OutroMovement): SceneState {
    const { sim, plan, side } = this;
    const trackDistance = clamp(station, this.min, this.max);
    const beat = clamp(musicBeat, 0, outroVolume.beats);
    const junctionPath = sim.junctionPath!;
    const distance = junctionPath.arcAt(trackDistance, side);
    const scale = modeScale(sim.mode);
    const through = distance + GATE_LOAD_AHEAD * scale;
    const visible = (s: number) => s >= distance - GATE_RELEASE_BEHIND && s <= through;
    const previewGates = this.main.filter(gate => visible(gate.routeStation));
    const previewEncore = this.encore.filter(gate => visible(gate.routeStation));
    const boosting = movement === 'Boost';
    return { mode: sim.mode, route: this.route, branch: { layout: sim.branch!.layout, side }, branchGates: sim.branchGates,
      junctionPath, phase: 'playing', camera: sim.camera, trackDistance, distance, beat, time: beat * sim.secondsPerBeat,
      steeringWidth: 0, routeGuide: null, routeSide: null, previewGates, previewEncore, outroPlan: plan,
      speed: cruiseTarget(Infinity) * scale * (boosting ? BOOST_MULTIPLIER : 1), boosting, boostLens: Number(boosting),
      hitTime: -Infinity, pickup: null, pickupVisible: false, pickupStation: Infinity, pickupPreviewStation: Infinity };
  }

}

export const resultPresets = ['Main Complete', 'Partial Encore', 'Perfect Encore', 'Sightseeing Complete'] as const;

export function previewResults(seed: number, preset: typeof resultPresets[number]): GameSnapshot {
  const mode = preset === 'Sightseeing Complete' ? 'sightseeing' : 'standard';
  const sim = new Simulation(outroVolume, { align: true }, undefined, mode);
  sim.start('normal', seed, 'lumen', mode);
  while (sim.phase === 'playing') {
    const boosting = preset === 'Perfect Encore' || (preset === 'Partial Encore' && sim.beat > 205);
    sim.step(STEP, { ...idleInput, boosting });
  }
  return { ...initialSnapshot, phase: 'results', mode, progress: 1, score: Math.floor(sim.score),
    gatesTotal: sim.gatesTotal, gatesPassed: sim.gatesPassed, maxCombo: sim.maxCombo,
    lives: sim.lives, maxLives: sim.maxLives, result: sim.result };
}
