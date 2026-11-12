import type { PlayMode } from '../contracts';
import { REJOIN_BEAT, routeCharts, SPLIT_BEAT } from './branches';
import { chartFor } from './chart';
import { STEP } from './clock';
import { SIGHTSEEING_SPEED } from './sightseeing';
import type { VolumeDefinition } from './volumes';

export const START_DISTANCE = 4200;
export const CRUISE_SPEED = 24;
export const SPEED_BONUS = 10;
export const CRUISE_RESPONSE = 1.6;
export const BOOST_MULTIPLIER = 1.45;

export const cruiseTarget = (count: number) => CRUISE_SPEED + Math.min(count * 0.22, SPEED_BONUS);
export const modeScale = (mode: PlayMode) => mode === 'sightseeing' ? SIGHTSEEING_SPEED : 1;

export class ReferenceTrack {
  private readonly samples: Float64Array;
  private readonly secondsPerBeat: number;
  private readonly gateStations: number[];

  constructor(volume: VolumeDefinition) {
    this.secondsPerBeat = 60 / volume.bpm;
    const normal = chartFor(volume, 'normal');
    const inJunction = (beat: number) => beat >= SPLIT_BEAT && beat < REJOIN_BEAT;
    const gates = volume.id === 'elsewhere'
      ? [...normal.filter(gate => !inJunction(gate.beat)),
        ...routeCharts(normal.filter(gate => inJunction(gate.beat))).main].sort((a, b) => a.beat - b.beat)
      : normal;
    this.samples = new Float64Array(Math.ceil(volume.beats * this.secondsPerBeat / STEP) + 1);
    let speed = CRUISE_SPEED, count = 0;
    for (let i = 0; i < this.samples.length - 1; i++) {
      const beat = i * STEP / this.secondsPerBeat;
      while (gates[count]?.beat <= beat + 1e-9) count++;
      speed += (cruiseTarget(count) - speed) * CRUISE_RESPONSE * STEP;
      this.samples[i + 1] = this.samples[i] + speed * STEP;
    }
    this.gateStations = gates.map(gate => this.station(gate.beat, 'standard'));
  }

  station(beat: number, mode: PlayMode) {
    const tick = Math.min(this.samples.length - 1, Math.max(0, beat * this.secondsPerBeat / STEP));
    const index = Math.floor(tick);
    const start = this.samples[index];
    const end = this.samples[index + 1] ?? start;
    return START_DISTANCE + (start + (end - start) * (tick - index)) * modeScale(mode);
  }

  countThrough(station: number, mode: PlayMode, previousCount: number) {
    const normal = START_DISTANCE + (station - START_DISTANCE) / modeScale(mode);
    let count = previousCount;
    while (this.gateStations[count] <= normal + 1e-8) count++;
    return count;
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
