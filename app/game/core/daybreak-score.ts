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
// The completion adds sustained layers, so the old percussion-only master
// stage is trimmed about 1 dB to keep the approved balance and peak headroom.
export const master = 1.9;
export const daybreakStems = ['kick', 'snare', 'hats', 'keys', 'lead', 'atmos'] as const;
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

/* ------------------------------------------------------------------ *
 *  GLASSHOUSE completion
 *
 *  The percussion above is the locked score. These layers are the chosen
 *  completion: a two-octave pad, syncopated glass plucks, an
 *  8th/16th arpeggio, sparse long mallet phrases and a quiet air layer.
 *  Times are absolute seconds from song start; `at` is the 16th grid step
 *  at which playStep schedules the event.
 * ------------------------------------------------------------------ */

type ChordSpec = {
  readonly pad: readonly number[];
  readonly pluck: readonly number[];
  readonly arp: readonly number[];
};

type LeadNote = {
  readonly bar: number;
  readonly at: number;
  readonly note: number;
  readonly length: number;
  readonly velocity: number;
};

export type DaybreakLayerEvent =
  | { readonly kind: 'pad'; readonly at: number; readonly time: number; readonly notes: readonly number[];
      readonly length: number; readonly level: number; readonly cutoff: number; readonly attack: number; readonly highpass: number }
  | { readonly kind: 'pluck'; readonly at: number; readonly time: number; readonly notes: readonly number[];
      readonly length: number; readonly level: number }
  | { readonly kind: 'arp'; readonly at: number; readonly time: number; readonly note: number;
      readonly length: number; readonly level: number; readonly pan: number }
  | { readonly kind: 'lead'; readonly at: number; readonly time: number; readonly note: number;
      readonly length: number; readonly level: number }
  | { readonly kind: 'air'; readonly at: number; readonly time: number; readonly type: 'riser' | 'shimmer' | 'impact';
      readonly length: number; readonly level: number };

const CHORDS: Record<string, ChordSpec> = {
  D:   { pad: [50,54,57,61,64], pluck: [62,66,69,73], arp: [62,66,69,73,76,73,69,66] },
  A:   { pad: [45,52,57,59,64], pluck: [57,59,64,69], arp: [57,59,64,69,64,59,57,52] },
  Bm:  { pad: [54,57,61,62,66], pluck: [57,61,62,66], arp: [59,62,66,69,66,62,59,54] },
  G:   { pad: [55,59,62,66,69], pluck: [59,62,66,69], arp: [59,62,66,69,71,69,66,62] },
  Df:  { pad: [57,61,64,69,73], pluck: [61,64,69,73], arp: [61,64,69,73,76,73,69,64] },
  Em:  { pad: [55,59,62,66,71], pluck: [59,62,66,71], arp: [59,62,66,71,74,71,66,62] },
  As:  { pad: [55,59,62,64,67], pluck: [59,62,64,67], arp: [57,59,62,64,67,64,62,59] },
  Bm7: { pad: [54,57,62,66,69], pluck: [57,62,66,69], arp: [57,62,66,69,66,62,57,54] },
  D6:  { pad: [57,59,64,66,69], pluck: [59,64,66,69], arp: [59,64,66,69,71,69,66,64] },
  GA:  { pad: [55,59,62,66,69], pluck: [59,62,66,69], arp: [59,62,66,69,71,69,66,62] },
};

const PLAN = [
  'D','A','Bm','G',
  'D','A','Bm','G', 'D','A','Bm','G', 'Df','G','Em','As', 'D','A','Bm','As',
  'Bm','G','Em','GA', 'Df','G','Bm7','A', 'Em','G','Df','As',
  'D6','A','Bm','G', 'Em','G','Df','As',
  'D','A','Bm','G', 'Df','G','Em','As', 'D','A','Bm7','G', 'Em','G','D6','As',
  'D','A','Bm','G', 'D6','G','Em','As', 'Df','G','Em','As',
  'D6','G','As','D6',
] as const;

if (PLAN.length !== score.length) throw new Error('DAYBREAK layer plan must cover every bar.');

const chords = PLAN.map((name, bar) => ({ ...CHORDS[name], bar, section: score[bar].section }));

const PAD_GAIN = 1.45;
const PAD_LEVEL: Record<string, number> = {
  OPEN: .018, GLIDE: .020, LIFT: .021, BREEZE: .023, SUNBURST: .020, RETURN: .021, OUTRO: .018,
};
const PAD_CUTOFF: Record<string, number> = {
  OPEN: 700, GLIDE: 1200, LIFT: 2200, BREEZE: 1500, SUNBURST: 4000, RETURN: 2000, OUTRO: 800,
};

const PLUCK_GAIN = 1.35;
const PLUCK_LEVEL: Record<string, number> = {
  OPEN: 0, GLIDE: .020, LIFT: .021, BREEZE: 0, SUNBURST: .022, RETURN: .020, OUTRO: 0,
};
const PLUCK_POS: Record<string, readonly number[]> = {
  OPEN: [], GLIDE: [0,6,10], LIFT: [0,4,8,12], BREEZE: [], SUNBURST: [0,4,8,12], RETURN: [0,6,12], OUTRO: [],
};

const ARP_GAIN = 2;
const ARP_LEVEL: Record<string, number> = {
  OPEN: .012, GLIDE: .022, LIFT: .022, BREEZE: .020, SUNBURST: .024, RETURN: .022, OUTRO: .012,
};
const ARP_POS: Record<string, readonly number[]> = {
  OPEN: [6], GLIDE: [2,6,10,14], LIFT: [2,4,6,8,10,12,14], BREEZE: [2,6,10,14],
  SUNBURST: [2,4,6,8,10,12,14], RETURN: [2,6,10,14], OUTRO: [6],
};

const LEAD_GAIN = .12;
const LEAD_LEVEL: Record<string, number> = {
  OPEN: .8, GLIDE: .8, LIFT: .8, BREEZE: .7, SUNBURST: .8, RETURN: .8, OUTRO: .8,
};

// [bar, sixteenth, MIDI note, length in sixteenths, velocity]
const LEAD_NOTES: readonly LeadNote[] = [
  { bar: 0, at: 0, note: 78, length: 6, velocity: .80 }, { bar: 0, at: 8, note: 83, length: 8, velocity: .76 },
  { bar: 2, at: 0, note: 81, length: 8, velocity: .72 },
  { bar: 8, at: 0, note: 81, length: 6, velocity: .62 }, { bar: 8, at: 8, note: 78, length: 6, velocity: .58 },
  { bar: 16, at: 0, note: 83, length: 8, velocity: .62 },
  { bar: 20, at: 0, note: 86, length: 8, velocity: .70 },
  { bar: 24, at: 0, note: 83, length: 6, velocity: .62 }, { bar: 24, at: 8, note: 86, length: 8, velocity: .64 },
  { bar: 36, at: 0, note: 78, length: 10, velocity: .68 },
  { bar: 40, at: 0, note: 86, length: 6, velocity: .64 }, { bar: 40, at: 8, note: 83, length: 8, velocity: .60 },
  { bar: 48, at: 0, note: 88, length: 8, velocity: .66 },
  { bar: 52, at: 0, note: 86, length: 6, velocity: .72 }, { bar: 52, at: 8, note: 83, length: 6, velocity: .68 },
  { bar: 56, at: 0, note: 78, length: 8, velocity: .62 },
  { bar: 60, at: 0, note: 81, length: 8, velocity: .60 },
  { bar: 68, at: 0, note: 74, length: 10, velocity: .70 },
  { bar: 71, at: 0, note: 74, length: 14, velocity: .68 },
];

const RISER_BARS = new Set([19, 31, 39, 55, 67]);
const SHIMMER_SECTIONS = new Set(['OPEN', 'BREEZE', 'OUTRO']);

function padLayers(bar: number): DaybreakLayerEvent[] {
  const chord = chords[bar], section = chord.section;
  const audio = onset(bar, 0);
  const level = PAD_LEVEL[section] * PAD_GAIN;
  const cutoff = PAD_CUTOFF[section] * 2;
  return [
    { kind: 'pad', at: 0, time: audio, notes: chord.pad, length: 1.85, level, cutoff, attack: .06, highpass: 190 },
    { kind: 'pad', at: 0, time: audio, notes: chord.pad.map(note => note + 12), length: 1.85,
      level: level * .45, cutoff: cutoff * 1.2, attack: .06, highpass: 300 },
  ];
}

function pluckLayers(bar: number): DaybreakLayerEvent[] {
  const chord = chords[bar], section = chord.section;
  const level = PLUCK_LEVEL[section] * PLUCK_GAIN;
  if (!level) return [];
  return PLUCK_POS[section].map(at => ({
    kind: 'pluck', at, time: onset(bar, at, swing), notes: chord.pluck, length: 2.4 * step, level,
  }));
}

function arpLayers(bar: number): DaybreakLayerEvent[] {
  const chord = chords[bar], section = chord.section;
  const level = ARP_LEVEL[section] * ARP_GAIN;
  const octave = section === 'OPEN' || section === 'OUTRO' ? 0 : 12;
  return ARP_POS[section].map((at, i) => ({
    kind: 'arp', at, time: onset(bar, at, swing), note: chord.arp[(i + bar) % chord.arp.length] + octave,
    length: .9 * step, level, pan: i % 2 ? .4 : -.4,
  }));
}

function leadLayers(bar: number): DaybreakLayerEvent[] {
  const section = chords[bar].section;
  const level = LEAD_GAIN * LEAD_LEVEL[section];
  return LEAD_NOTES.filter(note => note.bar === bar).map(note => ({
    kind: 'lead', at: note.at, time: onset(bar, note.at, .025), note: note.note,
    length: note.length * step, level: level * note.velocity,
  }));
}

function airLayers(bar: number): DaybreakLayerEvent[] {
  const section = chords[bar].section;
  const audio = onset(bar, 0);
  const events: DaybreakLayerEvent[] = [];
  if (RISER_BARS.has(bar)) {
    events.push({ kind: 'air', at: 0, time: audio, type: 'riser', length: 16 * step, level: .06 });
  }
  if (SHIMMER_SECTIONS.has(section)) {
    events.push({ kind: 'air', at: 0, time: audio, type: 'shimmer', length: 16 * step, level: .048 });
  }
  if (bar === 40) {
    events.push({ kind: 'air', at: 0, time: audio, type: 'impact', length: .55, level: .084 });
  }
  return events;
}

export const layers = score.map((_, bar) => [
  ...padLayers(bar), ...pluckLayers(bar), ...arpLayers(bar), ...leadLayers(bar), ...airLayers(bar),
]);

export function layerTimeline() {
  return layers.flatMap((events, bar) => events.map(event => ({
    ...event, bar, beat: event.time / beat, section: score[bar].section,
  })));
}
