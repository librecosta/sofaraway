import type { PlayMode } from '../contracts';
import { controlTrack } from './descent-score';
import { referenceFor } from './reference-track';
import type { VolumeDefinition } from './volumes';

// Seven music sections, six different rooms. ORDER and LOCK share the entry architecture.
export const facilityStages = [
  { name: 'CONTROL', width: 1.16, height: 1.22, bay: 10, armor: 0x334650, light: 0x8adcf5, laser: [0xc4e8ff, 0x8cdcff] },
  { name: 'CONTROL', width: 1.16, height: 1.22, bay: 10, armor: 0x334650, light: 0x8adcf5, laser: [0x8cdcff, 0x5cd9f5] },
  { name: 'TRANSIT', width: 1.88, height: 1.78, bay: 18, armor: 0x294451, light: 0x41bded, laser: [0x5cd9f5, 0x8a8eff] },
  { name: 'THE WELL', width: 4.60, height: 5.30, bay: 32, armor: 0x28313e, light: 0x7fa3ee, laser: [0x8a8eff, 0xe284d8] },
  { name: 'CORE', width: 3.36, height: 3.72, bay: 24, armor: 0x403c4c, light: 0xe4a56d, laser: [0xa0a1cb, 0x949eb8] },
  { name: 'LOCKDOWN', width: 1.62, height: 1.62, bay: 9, armor: 0x44323b, light: 0xfe5863, laser: [0xffc071, 0xff524f] },
  { name: 'BREACH', width: 4.20, height: 4.65, bay: 45, armor: 0x304047, light: 0xffd092, laser: [0xff8b63, 0xffcda1] },
] as const;

export function facilityZones(volume: VolumeDefinition, mode: PlayMode) {
  const reference = referenceFor(volume);
  return controlTrack.sections.map((section, i) => ({ ...facilityStages[i], section: section.name,
    start: i === 0 ? 0 : reference.station(section.startBeat, mode),
    finish: reference.station(section.endBeat, mode),
    end: i === controlTrack.sections.length - 1 ? Infinity : reference.station(section.endBeat, mode) }));
}
