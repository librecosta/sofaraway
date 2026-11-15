import type { PlayMode } from '../contracts';
import { chartFor } from './chart';
import { gameplayFor } from './gameplay';
import { STEP } from './clock';
import { BOOST_MULTIPLIER, CRUISE_SPEED, cruiseTarget, referenceMotion } from './reference-motion';
import { SIGHTSEEING_SPEED } from './sightseeing';
import type { VolumeDefinition } from './volumes';

export { BOOST_MULTIPLIER, CRUISE_RESPONSE, CRUISE_SPEED, cruiseTarget, SPEED_BONUS } from './reference-motion';
export const START_DISTANCE = 4200;
export const modeScale = (mode: PlayMode) => mode === 'sightseeing' ? SIGHTSEEING_SPEED : 1;

export class ReferenceTrack {
  private readonly boostFinishes = new Map<number, number>();
  private readonly sample: ReturnType<typeof referenceMotion>;
  private readonly duration: number;
  private readonly gateStations: number[];

  constructor(volume: VolumeDefinition) {
    const secondsPerBeat = 60 / volume.bpm;
    this.duration = volume.beats * secondsPerBeat;
    const normal = chartFor(volume, 'normal');
    const branch = gameplayFor(volume.id).branch;
    const inJunction = (beat: number) => branch && beat >= branch.split && beat < branch.rejoin;
    const gates = branch ? [...normal.filter(gate => !inJunction(gate.beat)),
      ...branch.charts(normal.filter(gate => inJunction(gate.beat))).main].sort((a, b) => a.beat - b.beat)
      : normal;
    this.sample = referenceMotion(volume.beats, secondsPerBeat, gates);
    this.gateStations = gates.map(gate => this.station(gate.beat, 'standard'));
  }

  station(beat: number, mode: PlayMode) {
    return START_DISTANCE + this.sample(beat) * modeScale(mode);
  }

  countThrough(station: number, mode: PlayMode, previousCount: number) {
    const normal = START_DISTANCE + (station - START_DISTANCE) / modeScale(mode);
    let count = previousCount;
    while (this.gateStations[count] <= normal + 1e-8) count++;
    return count;
  }

  /** Full Boost on the reference centerline, evaluated on the same fixed-step speed curve as a run. */
  boostFinish(mode: PlayMode, speedFactor = 1) {
    const scale = modeScale(mode) * speedFactor;
    const cached = this.boostFinishes.get(scale);
    if (cached !== undefined) return cached;
    const station = this.boostAt(this.duration, mode, speedFactor);
    this.boostFinishes.set(scale, station);
    return station;
  }

  boostAt(seconds: number, mode: PlayMode, speedFactor = 1, worldAt?: (arc: number) => number) {
    const scale = modeScale(mode) * speedFactor;
    let station = START_DISTANCE, speed = CRUISE_SPEED * scale, count = 0;
    for (let i = 0; i * STEP < seconds - 1e-9; i++) {
      const dt = Math.min(STEP, seconds - i * STEP);
      count = this.countThrough(worldAt?.(station) ?? station, mode, count);
      speed += (cruiseTarget(count) * BOOST_MULTIPLIER * scale - speed) * dt * 4;
      station += speed * dt;
    }
    return worldAt?.(station) ?? station;
  }
}

const references = new WeakMap<VolumeDefinition, ReferenceTrack>();

export function referenceFor(volume: VolumeDefinition) {
  let track = references.get(volume);
  if (!track) {
    track = new ReferenceTrack(volume);
    references.set(volume, track);
  }
  return track;
}
