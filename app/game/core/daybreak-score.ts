type Groove = Pick<DaybreakBar, 'kicks' | 'snares' | 'ghost' | 'hats'>;
type GrooveOverride = Partial<Groove & { fill: readonly number[] }>;

interface DaybreakBar {
  readonly bar: number;
  readonly section: string;
  readonly fill: readonly number[];
  readonly peak: boolean;
  readonly drumLevel: number;
  readonly kicks: readonly number[];
  readonly snares: readonly number[];
  readonly ghost: readonly number[];
  readonly hats: readonly number[];
}

export const bpm = 120;
const beat = 60 / bpm;
export const step = beat / 4;
export const swing = .085;
export const tail = 2;
export const master = 2.134;
export const daybreakStems = ['kick', 'snare', 'hats'] as const;
export type DaybreakStem = typeof daybreakStems[number];
export const onsetLead = .016;
export const onset = (bar: number, at = 0, shuffle = 0) => onsetLead + bar * 4 * beat + (at + (at % 2 === 1 ? shuffle : 0)) * step;

let firstBar = 0;
export const sections = ([
  ['OPEN', 4], ['GLIDE', 16], ['LIFT', 12], ['BREEZE', 8],
  ['SUNBURST', 16], ['RETURN', 12], ['OUTRO', 4],
] as const).map(([name, bars]) => {
  const startBar = firstBar;
  firstBar += bars;
  return { name, bars, startBar, endBar: firstBar, startBeat: startBar * 4, endBeat: firstBar * 4, start: startBar * 4 * beat, end: firstBar * 4 * beat };
});
export const duration = sections[sections.length - 1].end;
type Section = typeof sections[number];

const grooves = [
  [[0,6,10], [3]],
  [[0,3,7,14], [11]],
  [[0,5,10,15], [3]],
  [[0,6,9,14], [15]],
] as const;
const fullHats = [0,2,3,6,8,10,11,14,15];
const hatsLight = [2,6,10,14];
const mainSnare = [4,12];

function grooveFor(bar: number): Groove {
  const [kicks, ghost] = grooves[bar % 4];
  return { kicks, ghost, hats: fullHats, snares: mainSnare };
}

// These overrides cover OPEN and the first eight bars of GLIDE.
const openingBars: readonly GrooveOverride[] = [
  { kicks: [], snares: [], ghost: [], hats: [] },
  { kicks: [0], snares: [], ghost: [], hats: [6,14] },
  { kicks: [0,10], snares: [12], ghost: [] },
  { kicks: [0,6,10,15], ghost: [], fill: [13,14,15] },
  {},
  {},
  {},
  { fill: [10,13,15] },
  {},
  {},
  {},
  { fill: [9,11,13,14,15] },
];

const sectionFills: Partial<Record<Section['name'], Record<number, readonly number[]>>> = {
  GLIDE: { 11: [12,14,15], 15: [10,12,14,15] },
  LIFT: { 3: [12,14,15], 7: [13,15], 11: [12,14,15] },
  BREEZE: { 7: [12,14,15] },
  SUNBURST: { 3: [10,13,15], 7: [11,13,14,15], 11: [10,11,13,14,15], 15: [13,15] },
  RETURN: { 3: [13,15], 7: [11,14,15], 11: [13,15] },
};

function composeFrame(section: Section, index: number): DaybreakBar {
  const bar = section.startBar + index;
  if (bar < openingBars.length) {
    return { ...grooveFor(bar), fill: [], ...openingBars[bar], bar, section: section.name, peak: false, drumLevel: 1 };
  }
  const fill = sectionFills[section.name]?.[index] ?? [];
  const frame = { ...grooveFor(index), bar, fill, section: section.name, peak: false, drumLevel: 1 };
  switch (section.name) {
    case 'LIFT':
      return { ...frame, hats: index < 4 ? [2,6,8,10,14] : frame.hats };
    case 'BREEZE':
      return { ...frame, kicks: index === 7 ? [0,6,10,15] : index % 2 ? [0,7,13] : [0,10],
        snares: index % 2 ? [4,12] : [12], ghost: index % 2 ? [9] : [],
        hats: index === 7 ? [2,6,8,10,12,14,15] : hatsLight, drumLevel: .89 };
    case 'SUNBURST':
      return { ...frame, peak: true, ghost: frame.ghost.filter(at => !fill.includes(at)) };
    case 'RETURN':
      return { ...frame, hats: index < 4 ? [0,2,6,8,10,14] : frame.hats, drumLevel: .96 };
    case 'OUTRO':
      return { ...frame, kicks: [[0,6,10],[0,10],[0,6],[]][index], snares: [[4,12],[4,12],[4],[]][index],
        hats: [[2,6,10,14],[2,6,14],[2,6],[]][index], ghost: [], drumLevel: [.96,.90,.85,1][index] };
    default:
      return frame;
  }
}

export const score = sections.flatMap(section => Array.from({ length: section.bars }, (_, index) => composeFrame(section, index)));

// The synthesizer and dynamic lighting sample the same authored hits.
function drumsFor(frame: DaybreakBar) {
  const { bar, peak, drumLevel } = frame;
  const kick = frame.kicks.map(at => ({ kind: 'kick' as const, at, time: onset(bar, at), strength: .224 * (at ? .84 : 1) * (peak ? 1.06 : 1) * drumLevel }));
  const snare = frame.snares.map(at => ({ kind: 'snare' as const, at, time: onset(bar, at) + .008, strength: .19 * drumLevel }));
  const ghost = frame.ghost.map(at => ({ kind: 'ghost' as const, at, time: onset(bar, at, swing), strength: .076 * drumLevel }));
  const fill = frame.fill.map((at, i) => ({ kind: 'fill' as const, at, time: onset(bar, at, swing / 2),
    strength: (.055 + .011 * i) * drumLevel, hatStrength: .060 * drumLevel, pan: i % 2 ? .33 : -.31 }));
  const hat = frame.hats.map((at, i) => {
    const open = at === 14 && (peak || bar % 2 === 1);
    return { kind: 'hat' as const, at, time: onset(bar, at, swing), open, pan: i % 2 ? -.27 : .26,
      strength: .083 * (open ? 1.1 : i % 2 ? .64 : .90) * drumLevel };
  });
  return [...kick, ...snare, ...ghost, ...fill, ...hat];
}

export const drums = score.map(drumsFor);

export function rhythmTimeline() {
  const events = drums.flatMap((events, bar) => events.map(event => ({ ...event, bar, beat: event.time / beat, section: score[bar].section })));
  const transitions = sections.map(section => ({
    kind: 'section' as const, section: section.name, bar: section.startBar, time: section.start, beat: section.startBeat,
  }));
  return [...transitions, ...events].sort((a, b) => a.time - b.time);
}
