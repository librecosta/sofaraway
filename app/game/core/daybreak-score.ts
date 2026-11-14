type Chord = { bass: number; keys: readonly number[] };
type BassNote = readonly [step: number, interval: number, length: number];
type KeyStroke = readonly [step: number, length: number, velocity: number];
type Groove = Pick<DaybreakBar, 'kicks' | 'ghost' | 'bass' | 'hats' | 'keys' | 'snares'>;
type GrooveOverride = Partial<Groove & { fill: readonly number[] }>;
type BarPlan = readonly [Chord, (readonly number[])?];

interface DaybreakBar {
  readonly bar: number;
  readonly section: string;
  readonly chord: Chord;
  readonly fill: readonly number[];
  readonly peak: boolean;
  readonly drumLevel: number;
  readonly bassLevel: number;
  readonly keysLevel: number;
  readonly swell: 'normal' | 'peak' | null;
  readonly kicks: readonly number[];
  readonly snares: readonly number[];
  readonly ghost: readonly number[];
  readonly hats: readonly number[];
  readonly bass: readonly BassNote[];
  readonly keys: readonly KeyStroke[];
}

export const bpm = 120;
const beat = 60 / bpm;
export const step = beat / 4;
export const swing = .085;
export const tail = 2;
export const master = 2.134;
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

const D = {bass: 38,keys: [54,61,64,69]};
const A = {bass: 37,keys: [57,59,64,69]};
const B = {bass: 35,keys: [54,57,62,66]};
const G = {bass: 43,keys: [55,59,66,69]};
const Bm9 = {bass: 35,keys: [54,57,61,62,66]};
const Em = {bass: 40,keys: [55,59,62,66]};
const As = {bass: 45,keys: [55,57,59,62,64]};
const Df = {bass: 42,keys: [57,61,62,64,69]};
const D6 = {bass: 38,keys: [54,57,59,64,69]};
const GA = { bass: 45, keys: [55,59,62,66,69] }; // Gmaj9/A

const grooves: readonly (readonly [readonly number[], readonly number[], readonly BassNote[]])[] = [
  [[0,6,10], [3], [[1,0,2],[4,12,1.5],[7,0,2.25],[11,7,1.9],[14,12,1.35]]],
  [[0,3,7,14], [11], [[0,0,1.7],[4,7,1.45],[8,0,1.7],[10,12,1.5],[13,7,1.55]]],
  [[0,5,10,15], [3], [[1,0,2.4],[4,12,1.5],[7,7,1.65],[11,0,2.3],[14,12,0.8]]],
  [[0,6,9,14], [15], [[1,0,2.2],[4,7,1.1],[7,12,1.4],[10,0,2],[13,7,1.2]]],
];
const fullHats = [0,2,3,6,8,10,11,14,15];
const grooveKeys: readonly KeyStroke[] = [[0,4,0.94],[3,3,0.63],[7,4,0.78],[13,2.2,0.67]];
const mainSnare = [4, 12];
const grooveFor = (bar: number): Groove => {
  const [kicks, ghost, bass] = grooves[bar % 4];
  return { kicks, ghost, bass, hats: fullHats, keys: grooveKeys, snares: mainSnare };
};

const hatsLight = [2, 6, 10, 14];
const breezeBass: readonly BassNote[] = [[1,0,2.6],[6,12,1.7],[9,0,2.4],[13,7,1.45]];
const openingKeys: readonly KeyStroke[] = [[0,8.8,.9],[10,4.9,.67]];
const lightKeys: readonly KeyStroke[] = [[0,5,.89],[8,3,.63],[12,2.6,.61]];
const liftKeys: readonly KeyStroke[] = [[0,4,.91],[5,2.6,.64],[9,3,.76],[14,1.6,.57]];
const sunKeys: readonly KeyStroke[] = [[0,4.5,.95],[4,2.3,.64],[7,3.8,.76],[12,2.6,.71]];
const returnKeys: readonly KeyStroke[] = [[0,4.7,.88],[4,2.5,.56],[8,3.6,.77],[13,2,.62]];
const closing: readonly Pick<Groove, 'bass' | 'keys'>[] = [
  { bass: [[0,0,3.6],[7,7,2.9],[12,-2,2.8]], keys: grooveKeys },
  { bass: [[0,0,16.5]], keys: [[0,15.5,1.04],[9,7,0.55]] },
];

// Opening rows carry groove overrides. Later rows list a chord and optional fill steps.
const opening: readonly (readonly [Chord, GrooveOverride?])[] = [
  [D, { kicks: [], snares: [], ghost: [], hats: [], bass: [[0,0,5.2],[10,0,3.8]], keys: openingKeys }],
  [A, { kicks: [0], snares: [], ghost: [], hats: [6,14], keys: openingKeys }],
  [B, { kicks: [0,10], snares: [12], ghost: [], keys: openingKeys }],
  [G, { kicks: [0,6,10,15], ghost: [], fill: [13,14,15], keys: openingKeys }],
  [D],
  [A],
  [B],
  [G, {fill: [10,13,15]}],
  [D],
  [A],
  [B],
  [G, {fill: [9,11,13,14,15]}],
];
const glide: readonly BarPlan[] = [
  [D],
  [A],
  [B],
  [G, [12,14,15]],
  [Df],
  [G],
  [Em],
  [As, [10,12,14,15]],
];
const lift: readonly BarPlan[] = [
  [Bm9],
  [G],
  [Em],
  [GA, [12,14,15]],
  [Df],
  [G],
  [B],
  [A, [13,15]],
  [Em],
  [G],
  [Df],
  [As, [12,14,15]],
];
const breeze: readonly BarPlan[] = [
  [D6],
  [A],
  [Bm9],
  [G],
  [Em],
  [G],
  [Df],
  [As, [12,14,15]],
];
const sunburst: readonly BarPlan[] = [
  [D],
  [A],
  [Bm9],
  [G, [10,13,15]],
  [Df],
  [G],
  [Em],
  [A, [11,13,14,15]],
  [D],
  [A],
  [B],
  [G, [10,11,13,14,15]],
  [Em],
  [G],
  [D6],
  [As, [13,15]],
];
const returning: readonly BarPlan[] = [
  [D],
  [A],
  [Bm9],
  [G, [13,15]],
  [D6],
  [G],
  [Em],
  [A, [11,14,15]],
  [Df],
  [G],
  [Em],
  [GA, [13,15]],
];
const outro: readonly BarPlan[] = [
  [D6],
  [G],
  [As],
  [D6],
];
const plans = [[], glide, lift, breeze, sunburst, returning, outro];

function composeFrame(section: typeof sections[number], index: number, authored: BarPlan): DaybreakBar {
  const bar = section.startBar + index;
  if (bar < 12) {
    const [chord, overrides = {}] = opening[bar];
    return { ...grooveFor(bar), chord, fill: [], ...overrides, bar, section: section.name, peak: false,
      drumLevel: 1, bassLevel: 1, keysLevel: 1, swell: bar === 0 ? 'normal' : null };
  }
  const [chord, fill = []] = authored;
  const groove = grooveFor(index);
  const frame: DaybreakBar = { ...groove, bar, chord, fill, section: section.name, peak: false,
    drumLevel: 1, bassLevel: 1, keysLevel: 1, swell: null };
  switch (section.name) {
    case 'LIFT':
      return { ...frame, keys: liftKeys,
        hats: index < 4 ? [2,6,8,10,14] : frame.hats,
        swell: [0,4,8].includes(index) ? 'normal' : null };
    case 'BREEZE':
      return { ...frame, kicks: index === 7 ? [0,6,10,15] : index % 2 ? [0,7,13] : [0,10],
        snares: index % 2 ? [4,12] : [12], ghost: index % 2 ? [9] : [],
        hats: index === 7 ? [2,6,8,10,12,14,15] : hatsLight,
        bass: breezeBass, keys: lightKeys, drumLevel: .89, bassLevel: .94, keysLevel: .92 };
    case 'SUNBURST':
      return { ...frame, keys: sunKeys, peak: true, keysLevel: .98,
        ghost: frame.ghost.filter(at => !fill.includes(at)),
        swell: [0,4,8,12].includes(index) ? 'peak' : null };
    case 'RETURN':
      return { ...frame, keys: returnKeys,
        hats: index < 4 ? [0,2,6,8,10,14] : frame.hats, drumLevel: .96 };
    case 'OUTRO': {
      const source = index < 2 ? grooveFor(2 + index) : closing[index - 2];
      return { ...frame, kicks: [[0,6,10],[0,10],[0,6],[0]][index], snares: index === 3 ? [] : index === 2 ? [4] : [4,12],
        hats: [[2,6,10,14], [2,6,14], [2,6], []][index], ghost: [], bass: source.bass, keys: index < 2 ? lightKeys : source.keys,
        drumLevel: [.96,.90,.85,.74][index], swell: index === 3 ? 'normal' : null };
    }
    default:
      return frame;
  }
}

export const score = sections.flatMap((section, i) => Array.from({ length: section.bars }, (_, index) =>
  composeFrame(section, index, plans[i][section.name === 'GLIDE' ? index - 8 : index])));

// The synthesizer and dynamic lighting sample the same authored hits.
export function drumsFor(frame: DaybreakBar) {
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
