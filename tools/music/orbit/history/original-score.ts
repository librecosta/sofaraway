export const bpm = 128;
export const beatSeconds = 60 / bpm;
export const step = beatSeconds / 4;
export const seed = 0x41535452;

let startBar = 0;
const sections = ([['OUTER BELT', 8], ['DRIFT', 16], ['RINGBREAK', 16], ['MAELSTROM', 16],
  ['ECLIPSE', 8], ['AURORA', 16], ['APHELION', 16]] as const).map(([name, bars]) => {
  const start = startBar;
  startBar += bars;
  return { name, bars, startBar: start, endBar: startBar, startBeat: start * 4,
    endBeat: startBar * 4, start: start * 4 * beatSeconds, end: startBar * 4 * beatSeconds };
});

export const starwakeTrack = {
  id: 'starwake', title: 'ORBIT — STARWAKE', bpm, beatsPerBar: 4,
  bars: 96, beats: 384, duration: 180, tail: 4, seed, sections,
} as const;

type Common = { id: number; identity: string; bar: number; beat: number; at: number; velocity: number;
  section: string; accent: boolean; fill: boolean; transition: boolean; pan?: number };
export type OrbitEvent = Common & (
  | { voice: 'kick' }
  | { voice: 'snare'; ghost?: boolean }
  | { voice: 'hat'; open: boolean }
  | { voice: 'perc'; note: number }
  | { voice: 'bass' | 'pluck'; note: number; length: number }
  | { voice: 'lead'; note: number; length: number; motif: string }
  | { voice: 'pad'; notes: readonly number[]; length: number; color: number }
  | { voice: 'sweep'; length: number; rising: boolean }
);

type Melody = readonly (readonly [beat: number, note: number, length: number])[];
export const starwakeTheme: Melody = [[0, 69, 1.2], [1.5, 72, .8], [3, 77, 2.2], [6, 76, 1.2],
  [8, 72, 1.4], [10, 74, 2.1], [13, 69, 1.5], [15, 67, .65]];
const melodies: Record<string, Melody> = {
  theme: starwakeTheme,
  answer: [[0, 74, 1.5], [2, 72, 1], [4, 69, 2.3], [7, 67, .7], [8, 70, 1.4], [10, 69, 1], [12, 67, 1.5], [14, 74, 1.2]],
  fragment: [[2, 69, 1.5], [5, 72, 1.2], [11, 77, 2]],
  invitation: [[0, 69, 1.2], [1.5, 72, .8], [3, 77, 2.2], [6, 76, 1.2]],
  travel: [[.5, 72, 1.2], [2.5, 74, .8], [4, 77, 1.8], [7, 74, .65], [8.5, 72, 1.2], [11, 69, 1.5], [14, 67, 1.2]],
  question: [[1, 74, 1.4], [4, 72, 1.6], [7, 70, 1], [10, 69, 1.5], [13, 73, 1.5]],
  orbit: [[0, 69, 1.7], [2, 72, 1.1], [4, 77, 2.4], [7.5, 76, .8], [9, 74, 1.6], [11.5, 72, .8], [13, 69, 2]],
  moving: [[.75, 74, .8], [2.5, 72, 1], [4.5, 69, 1.5], [7.25, 67, .6], [9, 70, 1.2], [11, 69, .9], [13.5, 73, 1.4]],
  suspended: [[1, 74, 2.2], [6, 72, 2], [11, 69, 2.6]],
  beacon: [[.5, 67, 1.5], [4.5, 69, 2], [9, 73, 1.4], [12, 76, 2.2]],
  lift: [[0, 74, 1.4], [2, 72, 1], [4, 69, 2], [7, 72, .8], [8, 77, 2], [11, 76, 1.2], [13, 74, 2]],
  summit: [[0, 69, 1.3], [1.5, 72, .9], [3, 77, 2.2], [6, 76, 1.2], [8, 77, 1.5], [10, 79, 2], [13, 77, 2.2]],
  release: [[0, 77, 2], [3, 76, 1.5], [5.5, 74, 1.8], [8, 72, 2], [11, 69, 1.4], [13, 67, 2]],
  recollection: [[0, 69, 1.8], [2.5, 72, 1.1], [4, 77, 2.6], [8.5, 74, 1.8], [12, 69, 2.7]],
  landing: [[0, 70, 2], [3, 69, 1.8], [6, 67, 2.5], [10, 69, 2], [13, 65, 2.5]],
  coda: [[0, 67, 2.2], [4, 69, 2.6], [8, 72, 2.4], [12, 65, 3.6]],
};

const harmony = {
  F: [41, [53, 57, 72, 79]], Fa: [33, [57, 60, 65, 79]],
  C: [36, [52, 55, 72, 74]], Ce: [40, [55, 60, 64, 74]],
  Cs: [36, [50, 55, 72, 74]], Bb: [34, [53, 57, 72, 74]],
  Bbd: [38, [57, 62, 65, 72]], Dm: [38, [53, 57, 72, 76]],
  Dma: [33, [57, 62, 65, 76]], Gm: [31, [53, 57, 70, 74]],
  Eb: [39, [55, 58, 74, 77]], Em: [40, [55, 58, 74, 76]],
  As: [33, [55, 57, 74, 76]], A7: [33, [55, 57, 73, 76]],
} as const;
type Harmony = keyof typeof harmony;

// Each row owns four bars of harmonic, rhythmic and thematic development.
export const starwakePhrases = [
  ['F F Bb Cs', 0, 0, 0, ''], ['F Fa Bb Cs', 1, 1, 1, 'fragment'],
  ['F C Dm Bb', 2, 2, 2, 'invitation'], ['Gm Cs F A7', 3, 3, 3, 'answer'],
  ['Dm Bbd F Ce', 4, 2, 4, 'travel'], ['Gm Bb As A7', 5, 4, 1, 'question'],
  ['Bb F C Dm', 6, 2, 2, 'theme'], ['Gm Bb Cs C', 3, 3, 3, 'answer'],
  ['F Ce Dm Bbd', 4, 4, 4, 'orbit'], ['Gm Fa Bb Cs', 5, 3, 5, 'travel'],
  ['Dm Bb Gm A7', 7, 5, 4, 'moving'], ['Eb Bb Em A7', 6, 4, 5, 'question'],
  ['Dm Fa Gm Ce', 7, 5, 3, 'travel'], ['Bb Gm As A7', 5, 4, 1, 'moving'],
  ['Dm Dma Gm Gm', 0, 0, 0, 'suspended'], ['Bb Em As A7', 1, 1, 1, 'beacon'],
  ['Bb F C Dm', 6, 4, 5, 'theme'], ['Gm Fa Bb Cs', 4, 3, 2, 'lift'],
  ['F Ce Dm Bbd', 6, 5, 3, 'summit'], ['Gm Bbd Cs C', 3, 4, 4, 'release'],
  ['F C Dm Bb', 2, 3, 2, 'orbit'], ['Gm Fa Bb Cs', 4, 2, 3, 'recollection'],
  ['Dm Bb Gm C', 3, 1, 1, 'landing'], ['Gm Cs F F', 0, 0, 0, 'coda'],
] as const;

// Four bar cells per groove, expressed on the sixteenth grid.
const kicks = [[0], [0, 8], [0, 4, 8], [0, 4, 8, 14], [0, 4, 8, 12],
  [0, 6, 8], [0, 4, 8, 11, 12], [0, 3, 8, 12], [0, 4, 10], [0, 4, 8, 12, 15]];
const grooves = [[0, 0, 1, 1], [1, 2, 1, 3], [2, 3, 4, 5], [4, 6, 9, 8],
  [4, 3, 6, 5], [7, 4, 9, 8], [4, 6, 9, 4], [7, 6, 9, 5]];
const bassLines = [
  [[0, 6, 0]], [[.8, 4.2, 0], [9, 3.8, 0]],
  [[.8, 3, 0], [6, 1.8, 0], [8.8, 3.2, 0], [13.5, 1.7, 0]],
  [[.8, 4, 0], [6.5, 1.5, 7], [9, 3.4, 0], [14, 1.4, 2]],
  [[.7, 3.5, 0], [5.5, 2.1, 0], [9.5, 2.8, 7], [14, 1.5, 0]],
  [[.75, 2.6, 0], [4.75, 1.4, 0], [7, 1.4, 7], [9, 2.5, 0], [13, 2, 2]],
];
const arpSteps = [[3, 11], [2, 8, 14], [2, 6, 10, 14], [1.5, 6, 10.5, 14],
  [2, 5.5, 9, 12.5, 14.5], [2, 10, 14]];
const phraseEnds = new Map([[7, 12], [23, 13], [39, 12], [55, 10], [63, 12], [79, 14], [91, 11], [93, 8], [94, 4], [95, 0]]);
const fills = new Set([15, 23, 31, 39, 47, 51, 63, 71, 79, 87]);

export function makeStarwakeScore(): OrbitEvent[] {
  const events: OrbitEvent[] = [];
  let previousVoicing: number[] = [];
  const put = (bar: number, sixteenth: number, voice: OrbitEvent['voice'], velocity: number, detail = {}) => {
    const beat = bar * 4 + sixteenth / 4;
    const section = sections.find(section => bar < section.endBar)!;
    events.push({ voice, bar, beat, at: beat * beatSeconds, velocity, section: section.name,
      accent: voice === 'kick' || voice === 'lead', fill: false, transition: voice === 'sweep', ...detail } as OrbitEvent);
  };
  for (const [phrase, [changes, groove, bass, arp, motif]] of starwakePhrases.entries()) {
    const chords = changes.split(' ') as Harmony[];
    const section = sections.find(section => phrase * 4 < section.endBar)!;
    const aurora = section.name === 'AURORA';
    for (let cell = 0; cell < 4; cell++) {
      const bar = phrase * 4 + cell;
      const [root, notes] = harmony[chords[cell]];
      const cutoff = phraseEnds.get(bar) ?? 16;
      let kick = kicks[grooves[groove][cell]];
      let snare = [4, 12];
      let hats = phrase % 3 === 1 && cell === 2 ? [2, 6, 10, 13.5, 14] : [2, 6, 10, 14];
      if (bar < 8) {
        kick = bar < 3 ? [] : bar < 6 ? [0] : [0, 8];
        snare = bar === 7 ? [12] : [];
        hats = bar < 2 ? [] : bar < 5 ? [6, 14] : [2, 6, 10, 14];
      }
      if (bar >= 56 && bar < 64) {
        kick = bar === 56 ? [0, 8] : bar === 59 ? [] : [0];
        snare = bar === 56 ? [12] : [];
        hats = bar < 58 ? [6, 14] : bar > 61 ? [14] : [];
      }
      if (bar >= 88) {
        kick = bar < 90 ? [0, 4, 8, 12] : bar < 92 ? [0, 8] : bar < 95 ? [0] : [];
        snare = bar < 91 ? [4, 12] : [];
        hats = bar < 92 ? [2, 6, 10, 14] : bar < 94 ? [6, 14] : [];
      }
      const eclipse = bar >= 56 && bar < 64;
      const force = eclipse ? (bar === 56 ? .65 : .54) : bar >= 40 && bar < 56 ? .94 : aurora ? .92 : .84;
      for (const hit of kick) if (hit < cutoff) put(bar, hit, 'kick', force * (hit % 4 ? .72 : 1));
      for (const hit of snare) if (hit < cutoff) put(bar, hit, 'snare', force * .85);
      for (const [i, hit] of hats.entries()) if (hit < cutoff) put(bar, hit, 'hat', i % 2 ? .34 : .49,
        { open: cell === 2 && hit === 14, pan: i % 2 ? .30 : -.25 });
      if (bar >= 8 && bar < 88 && (bar < 56 || bar >= 64)) {
        if ((phrase % 2 === 1 && cell === 3) || (groove === 7 && cell === 1)) put(bar, 11, 'snare', .22, { ghost: true });
        if (cell === 1 || cell === 2) put(bar, groove === 7 ? 13.5 : 7, 'perc', .38,
          { note: cell === 1 ? 62 : 57, pan: cell === 1 ? -.45 : .4 });
      }
      if (fills.has(bar)) for (const [i, hit] of [13, 14.5, 15.25].entries()) {
        put(bar, hit, 'snare', .22 + i * .08, { ghost: true, fill: true, transition: true });
      }
      let line: readonly (readonly number[])[] = bassLines[bass];
      if (bar < 4 || bar === 59 || bar === 95) line = [];
      else if (bar < 8 || (bar >= 56 && bar < 64) || bar >= 92) line = [[0, bar >= 60 && bar < 64 ? 3.5 : 6, 0]];
      for (const [i, [at, length, interval]] of line.entries()) if (at < cutoff) {
        put(bar, at, 'bass', eclipse ? .55 : .81 - i % 2 * .13,
          { note: Math.min(48, root + interval), length: Math.min(length, 16 - at) * step });
      }
      if (cell % 2 === 0 || bar === 95 || (aurora && cell === 3)) {
        // Move individual voices by octaves toward the preceding voicing.
        const voicing = notes.map((note, i) => {
          if (!previousVoicing.length) return note;
          return [note - 12, note, note + 12].filter(pitch => pitch >= 53 && pitch <= 81)
            .sort((a, b) => Math.abs(a - previousVoicing[i]) - Math.abs(b - previousVoicing[i]))[0];
        });
        previousVoicing = voicing;
        put(bar, 0, 'pad', eclipse ? (bar === 56 ? .44 : bar === 62 ? .40 : .36) : .48,
          { notes: voicing, length: (bar === 95 ? 3.5 : aurora && cell >= 2 ? 3.5 : 6.8) * beatSeconds,
            color: aurora ? .82 : bar >= 56 && bar < 64 ? .36 : .52 });
      }
      let positions: readonly number[] = arpSteps[arp];
      if (bar < 4) positions = positions.slice(0, cell < 2 ? 1 : 2);
      if (bar >= 56 && bar < 60) positions = cell % 2 === 0 ? [5] : [];
      if (bar >= 60 && bar < 64) positions = [5, 13];
      if (aurora) positions = [2, 10];
      if (bar >= 94) positions = [];
      const upper = [...notes].sort((a, b) => a - b).map(note => note < 60 ? note + 12 : note);
      for (const [i, hit] of positions.entries()) if (hit < cutoff) put(bar, hit, 'pluck', eclipse ? .28 : .35,
        { note: upper[(i * 2 + cell + phrase) % upper.length], length: 1.1 * beatSeconds,
          pan: [-.48, .23, .48, -.20][i % 4], accent: i === 0 });
    }
    for (const [i, [beat, note, length]] of (melodies[motif] ?? []).entries()) {
      put(phrase * 4 + Math.floor(beat / 4), beat % 4 * 4, 'lead',
        phrase < 3 ? .55 : section.name === 'ECLIPSE' ? .52 : aurora ? .80 : .65, { note,
          length: length * beatSeconds * (aurora ? 1.12 : 1), pan: .04,
          motif, accent: i === 0 || i === 2 });
    }
  }
  for (const bar of [7, 23, 39, 55, 63, 79, 87]) put(bar, 8, 'sweep', .42,
    { length: 2 * beatSeconds, rising: true });
  for (const bar of [8, 24, 40, 64, 80]) put(bar, 0, 'sweep', .28,
    { length: 1.5 * beatSeconds, rising: false });
  return events.sort((a, b) => a.at - b.at || a.voice.localeCompare(b.voice))
    .map((event, id) => ({ ...event, id, identity: `starwake:${id}` }));
}

export const starwakeEvents = makeStarwakeScore();
const indexedSteps: number[][] = Array.from({ length: starwakeTrack.bars * 16 }, () => []);
for (const [i, event] of starwakeEvents.entries()) indexedSteps[Math.floor(event.beat * 4 + 1e-8)].push(i);
export const starwakeSteps: readonly (readonly number[])[] = indexedSteps;
