import type { PlayMode } from '../contracts';
import { controlTrack } from './descent-score';
import { referenceFor } from './reference-track';
import type { VolumeDefinition } from './volumes';

// Seven music sections, six different rooms. ORDER and LOCK share the entry architecture.
export const facilityStages = [
  { name: 'CONTROL', width: 1.93, height: 1.63, bay: 10, armor: 0x334650, light: 0x8adcf5, laser: [0xc4e8ff, 0x8cdcff] },
  { name: 'CONTROL', width: 1.93, height: 1.63, bay: 10, armor: 0x334650, light: 0x8adcf5, laser: [0x8cdcff, 0x5cd9f5] },
  { name: 'TRANSIT', width: 4.35, height: 3.70, bay: 18, armor: 0x294451, light: 0x7799f1, laser: [0x5cd9f5, 0x8a8eff] },
  { name: 'THE WELL', width: 8.00, height: 8.40, bay: 32, armor: 0x28313e, light: 0xa485e2, laser: [0x8a8eff, 0xe284d8] },
  { name: 'CORE', width: 9.80, height: 6.30, bay: 27, armor: 0x403c4c, light: 0x93a0c4, laser: [0xa0a1cb, 0x949eb8] },
  { name: 'LOCKDOWN', width: 2.40, height: 2.05, bay: 9, armor: 0x44323b, light: 0xfe765a, laser: [0xffc071, 0xff524f] },
  { name: 'BREACH', width: 6.20, height: 5.30, bay: 45, armor: 0x304047, light: 0xc8e0e9, laser: [0xff8b63, 0xffcda1] },
] as const;

export function facilityZones(volume: VolumeDefinition, mode: PlayMode) {
  const reference = referenceFor(volume);
  return controlTrack.sections.map((section, i) => ({ ...facilityStages[i], section: section.name,
    start: i === 0 ? 0 : reference.station(section.startBeat, mode),
    finish: reference.station(section.endBeat, mode),
    end: i === controlTrack.sections.length - 1 ? Infinity : reference.station(section.endBeat, mode) }));
}
