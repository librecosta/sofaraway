import { initialSnapshot } from '../contracts';
import type { Difficulty, GameSnapshot, PlayMode } from '../contracts';
import type { RouteKind, RouteSide } from '../core/branches';
import { clamp } from '../core/collision';
import { STEP } from '../core/clock';
import { difficultySettings } from '../core/chart';
import { idleInput } from '../core/input';
import type { EncoreGate, OutroPlan } from '../core/encore';
import { daylightFade } from '../core/gameplay';
import type { SceneState } from '../graphics/scene.client';
import { BOOST_MULTIPLIER, cruiseTarget, modeScale } from '../core/reference-track';
import { GATE_RELEASE_BEHIND, Simulation } from '../core/simulation';
import type { RunGate } from '../core/simulation';
import { sectionAt, volumeById } from '../core/volumes';
import type { VolumeDefinition } from '../core/volumes';

export const outroVolume = volumeById('elsewhere');
export const outroPresets = [
  ['build', 'BUILD Gates'], ['drop', 'DROP Gates'], ['branch', 'Selected Route'], ['finale', 'FINALE Gates'],
  ['main-last', 'Main Last Gate'], ['transition', 'Transition'],
  ['encore-first', 'Encore First Gate'], ['encore-middle', 'Encore Middle'], ['encore-final', 'Encore Final Gate'],
  ['afterglow-entry', 'Afterglow Entry'], ['afterglow-peak', 'Afterglow Peak'], ['music-end', 'Music End'],
  ['branch-preview', 'Branch Preview'], ['branch-entry', 'Branch Entrance'], ['branch-rejoin', 'Branch Rejoin'],
  ['pickup', 'Pickup'], ['white-start', 'Escape White Start'], ['white-peak', 'Escape White Peak'],
  ['results-world', 'Results Background'],
] as const;
export type OutroPreset = typeof outroPresets[number][0];
export const movements = ['Paused', 'Cruise', 'Boost'] as const;
export type OutroMovement = typeof movements[number];
export const exteriorViews = {
  Forward: [0, 0, 0],
  'Look Up': [0, 25, 0],
  'Cabin Side': [48, 6, 1.25],
  Horizon: [-15, 0, 1.6],
  'Cloud Sea': [-24, -21, 19],
} as const;
export type ExteriorView = keyof typeof exteriorViews;
const chapters = { build: 'BUILD', drop: 'DROP', finale: 'FINALE' } as const;

export function outroView(plan: OutroPlan, preset: OutroPreset) {
  const peek = 22 * modeScale(plan.mode);
  const index = preset === 'encore-first' ? 0 : preset === 'encore-middle' ? Math.ceil(plan.gates.length / 2) - 1
    : preset === 'encore-final' ? plan.gates.length - 1 : -1;
  const gate = plan.gates[index];
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

  constructor(mode: PlayMode, seed: number, private readonly route: RouteKind, path?: Simulation['path'], difficulty: Difficulty = 'normal',
    readonly volume: VolumeDefinition = outroVolume) {
    this.sim = new Simulation(volume, {}, path, mode, difficulty);
    this.sim.start(difficulty, seed, undefined, mode);
    this.plan = this.sim.outroPlan!;
    const { layout } = this.sim.branch!;
    this.side = route === 'main' ? 'center' : layout.left === route ? 'left' : 'right';
    const routeStation = (station: number) => this.sim.junctionPath!.arcAt(station, this.side);
    this.main = [...this.sim.mainGates.map(gate => ({ ...gate, routeStation: routeStation(gate.worldStation) })),
      ...this.sim.branchGates![route]].sort((a, b) => a.worldStation - b.worldStation);
    this.encore = this.plan.gates.map(gate => ({ ...gate, routeStation: routeStation(gate.worldStation) }));
    this.min = this.sim.reference.station(volume.id === 'daybreak' ? 0 : 158, mode);
    this.max = Math.min(this.plan.afterglowEnd, this.sim.path.length - 430);
  }

  view(preset: OutroPreset) {
    const { sim, volume, side } = this;
    const path = sim.junctionPath!;
    if (preset === 'branch-preview') return { station: path.start + 9 * modeScale(sim.mode), musicBeat: path.spec.preview };
    if (preset === 'branch-entry') return { station: path.open - 30 * modeScale(sim.mode), musicBeat: path.openBeat };
    if (preset === 'branch-rejoin') return { station: path.merge - 24 * modeScale(sim.mode), musicBeat: path.mergeBeat };
    if (preset === 'pickup') return { station: sim.pickupStation - 15 * modeScale(sim.mode), musicBeat: sim.gameplay.pickup!.beat };
    if (preset === 'white-start' || preset === 'white-peak' || preset === 'results-world') {
      const musicBeat = preset === 'white-start' ? volume.beats - 12 : volume.beats;
      const station = sim.reference.boostAt(musicBeat * sim.secondsPerBeat, sim.mode,
        difficultySettings(volume, sim.difficulty).speedFactor, arc => path.stationAt(arc, side));
      return { station: station + (preset === 'results-world' ? 9 : 0), musicBeat };
    }
    if (preset === 'branch') {
      const gates = sim.branchGates![this.route];
      const gate = volume.id === 'daybreak'
        ? gates.find(gate => gate.worldStation >= path.open + 35 * modeScale(sim.mode) &&
          (this.route === 'score' || gate.kind === 'daybreak-crystal')) ?? gates[Math.floor(gates.length / 3)]
        : gates[0];
      return { station: gate.worldStation - 13 * modeScale(this.sim.mode), musicBeat: gate.beat };
    }
    if (preset in chapters) {
      const chapter = volume.id === 'daybreak' ? { build: 'LIFT', drop: 'SUNBURST', finale: 'RETURN' }[preset as keyof typeof chapters]
        : chapters[preset as keyof typeof chapters];
      const gates = this.main.filter(gate => sectionAt(volume, gate.beat)?.name === chapter);
      const gate = gates.find(gate => gate.inserted) ?? gates[0];
      return { station: gate.worldStation - 22 * modeScale(this.sim.mode), musicBeat: gate.beat };
    }
    const view = outroView(this.plan, preset);
    if (volume.id !== 'daybreak') return view;
    const end = path.stationAt(this.plan.musicEndStation, side);
    const speed = cruiseTarget(Infinity) * BOOST_MULTIPLIER * modeScale(sim.mode) * difficultySettings(volume, sim.difficulty).speedFactor;
    return { ...view, musicBeat: clamp(volume.beats - (end - view.station) / (speed * sim.secondsPerBeat), 0, volume.beats) };
  }

  stationAfter(station: number, travel: number) {
    const path = this.sim.junctionPath!;
    return Math.min(this.max, path.stationAt(path.arcAt(station, this.side) + travel, this.side));
  }

  state(station: number, musicBeat: number, movement: OutroMovement, results = false): SceneState {
    const { sim, plan, side } = this;
    const trackDistance = clamp(station, this.min, this.max);
    const beat = clamp(musicBeat, 0, this.volume.beats);
    const junctionPath = sim.junctionPath!;
    const previewingBranch = this.volume.id === 'daybreak' && trackDistance < junctionPath.split;
    const layout = sim.branch!.layout;
    const guide = this.volume.id === 'daybreak' && !results && trackDistance >= junctionPath.guideStart && trackDistance < junctionPath.guideEnd;
    const distance = previewingBranch ? trackDistance : junctionPath.arcAt(trackDistance, side);
    const scale = modeScale(sim.mode);
    const through = distance + sim.gateLoadAhead;
    const visible = (s: number) => s >= distance - GATE_RELEASE_BEHIND && s <= through;
    const previewGates = this.main.filter(gate => visible(gate.routeStation));
    const previewEncore = this.encore.filter(gate => visible(gate.routeStation));
    const boosting = movement === 'Boost';
    const cruise = cruiseTarget(Infinity) * scale * difficultySettings(this.volume, sim.difficulty).speedFactor;
    const speed = cruise * (boosting ? BOOST_MULTIPLIER : 1);
    const ending = sim.gameplay.ending;
    let escapeWhite: number | undefined;
    if (ending && !results) {
      const elapsed = (musicBeat - (this.volume.beats - ending.beats)) * sim.secondsPerBeat;
      const duration = ending.beats * sim.secondsPerBeat;
      if (elapsed <= 0) escapeWhite = 0;
      else {
        // A flythrough has a declared speed. Project its final reachable gate on that timeline.
        const previewSpeed = movement === 'Paused' ? cruise * BOOST_MULTIPLIER : speed;
        const finishArc = distance + Math.max(0, duration - elapsed) * previewSpeed;
        let last: RunGate | EncoreGate | undefined;
        if (ending.protectGates) {
          for (const gates of [this.main, this.encore]) {
            for (const gate of gates) {
              if (gate.routeStation > finishArc) break;
              last = gate;
            }
          }
        }
        const releasedAt = last ? Math.max(0, Math.min(elapsed, duration) + (last.routeStation - distance) / previewSpeed) : 0;
        escapeWhite = daylightFade(elapsed, duration, releasedAt);
      }
    }
    const pickupVisible = trackDistance >= sim.pickupPreviewStation && trackDistance < sim.pickupStation;
    return { mode: sim.mode, route: previewingBranch ? null : this.route,
      branch: { layout, side: previewingBranch ? null : side }, branchGates: sim.branchGates,
      junctionPath, phase: results ? 'results' : 'playing', camera: sim.camera, trackDistance, distance, beat, time: beat * sim.secondsPerBeat,
      steeringWidth: 0, routeGuide: guide ? layout : null, routeSide: guide ? previewingBranch ? 'center' : side : null,
      previewGates, previewEncore, outroPlan: plan,
      speed, boosting, boostLens: Number(boosting), escapeWhite,
      hitTime: -Infinity, pickup: sim.pickup, pickupVisible, pickupStation: sim.pickupStation, pickupPreviewStation: sim.pickupPreviewStation };
  }

  roam(phase: 'menu' | 'results', minutes: number) {
    const sim = new Simulation(this.volume, { align: true, branchSide: this.side }, this.sim.path, this.sim.mode, this.sim.difficulty);
    if (phase === 'results') {
      sim.start(this.sim.difficulty, this.plan.seed, undefined, this.sim.mode);
      while (sim.phase === 'playing' || sim.phase === 'crash') sim.step(STEP, { ...idleInput, boosting: true });
    }
    for (let second = 0; second < minutes * 60; second++) sim.step(1, idleInput);
    return sim;
  }

}

export const resultPresets = ['Main Complete', 'Partial Encore', 'Perfect Encore', 'Sightseeing Complete'] as const;

export function previewResults(seed: number, preset: typeof resultPresets[number], difficulty: Difficulty = 'normal',
  volume = outroVolume): GameSnapshot {
  const mode = preset === 'Sightseeing Complete' ? 'sightseeing' : 'standard';
  const sim = new Simulation(volume, { align: true }, undefined, mode);
  sim.start(difficulty, seed, 'lumen', mode);
  while (sim.phase === 'playing') {
    const boosting = preset === 'Perfect Encore' || (preset === 'Partial Encore' && sim.beat > (volume.id === 'elsewhere' ? 205 : 132));
    sim.step(STEP, { ...idleInput, boosting });
  }
  return { ...initialSnapshot, phase: 'results', volumeId: volume.id, mode, difficulty: sim.difficulty, progress: 1, score: Math.floor(sim.score),
    gatesTotal: sim.gatesTotal, gatesPassed: sim.gatesPassed, maxCombo: sim.maxCombo,
    lives: sim.lives, maxLives: sim.maxLives, result: sim.result };
}
