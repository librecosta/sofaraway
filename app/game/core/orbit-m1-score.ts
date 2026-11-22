import { beatSeconds, starwakeEvents, starwakeTheme, starwakeTrack } from './orbit-score';
import type { OrbitEvent } from './orbit-score';

/** Audition only. Original events remain the sole production score and chart source. */
export const orbitM1Track = { ...starwakeTrack, id: 'starwake-m1',
  title: 'ORBIT — STARWAKE M1 · Original Lead / No Bass & Pluck' } as const;

// Five quiet quotations, not a replacement melody. No changes to original notes,
// harmony, envelopes, effects or IDs. The middle gap already has original Pad tails.
const repairs = [
  { beat: 6, theme: 0, velocity: .28 },
  { beat: 9, theme: 1, velocity: .29 },
  { beat: 12, theme: 2, velocity: .30 },
  { beat: 40, theme: 4, velocity: .38 },
  { beat: 44, theme: 6, velocity: .36 },
] as const;

const firstRepairId = Math.max(...starwakeEvents.map(event => event.id)) + 1;
export const orbitM1Repairs: readonly OrbitEvent[] = repairs.map((repair, index) => {
  const [, note, beats] = starwakeTheme[repair.theme];
  const bar = Math.floor(repair.beat / 4), id = firstRepairId + index;
  return { id, identity: `starwake-m1-f1:repair:${index}`, voice: 'lead',
    bar, beat: repair.beat, at: repair.beat * beatSeconds, velocity: repair.velocity,
    section: starwakeTrack.sections.find(section => bar < section.endBar)!.name,
    accent: false, fill: false, transition: false, pan: .04,
    note, length: beats * beatSeconds, motif: 'original-theme-quotation' };
});

export function makeOrbitM1Score(): OrbitEvent[] {
  // Keep every original object (including IDs/noise seeds) and its relative order.
  return [...starwakeEvents.filter(event => event.voice !== 'bass' && event.voice !== 'pluck'),
    ...orbitM1Repairs].sort((a, b) => a.at - b.at || a.voice.localeCompare(b.voice));
}

export const orbitM1Events = makeOrbitM1Score();
const steps: number[][] = Array.from({ length: orbitM1Track.bars * 16 }, () => []);
for (const [index, event] of orbitM1Events.entries()) steps[Math.floor(event.beat * 4 + 1e-8)].push(index);
export const orbitM1Steps: readonly (readonly number[])[] = steps;
