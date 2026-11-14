export const bpm = 120;
const beat = 60 / bpm;
export const step = beat / 4;
export const swing = .085;
export const tail = 2;
export const master = 2.134;
export const onset = (bar, at = 0, shuffle = 0) => .016 + bar * 4 * beat + (at + (at % 2 === 1 ? shuffle : 0)) * step;

let firstBar = 0;
export const sections = [
  ['OPEN', 4], ['GLIDE', 16], ['LIFT', 12], ['BREEZE', 8],
  ['SUNBURST', 16], ['RETURN', 12], ['OUTRO', 4],
].map(([name, bars]) => {
  const startBar = firstBar;
  firstBar += bars;
  return { name, bars, startBar, endBar: firstBar, startBeat: startBar * 4, endBeat: firstBar * 4, start: startBar * 4 * beat, end: firstBar * 4 * beat };
});
export const duration = sections.at(-1).end;

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

const grooves = [
  [[0,6,10], [3], [[1,0,2],[4,12,1.5],[7,0,2.25],[11,7,1.9],[14,12,1.35]]],
  [[0,3,7,14], [11], [[0,0,1.7],[4,7,1.45],[8,0,1.7],[10,12,1.5],[13,7,1.55]]],
  [[0,5,10,15], [3], [[1,0,2.4],[4,12,1.5],[7,7,1.65],[11,0,2.3],[14,12,0.8]]],
  [[0,6,9,14], [15], [[1,0,2.2],[4,7,1.1],[7,12,1.4],[10,0,2],[13,7,1.2]]],
];
const fullHats = [0,2,3,6,8,10,11,14,15];
const grooveKeys = [[0,4,0.94],[3,3,0.63],[7,4,0.78],[13,2.2,0.67]];
const mainSnare = [4, 12];
const grooveFor = bar => {
  const [kicks, ghost, bass] = grooves[bar % 4];
  return { kicks, ghost, bass, hats: fullHats, keys: grooveKeys, snares: mainSnare };
};

const hatsLight = [2, 6, 10, 14];
const breezeBass = [[1,0,2.6],[6,12,1.7],[9,0,2.4],[13,7,1.45]];
const openingKeys = [[0,8.8,.9],[10,4.9,.67]];
const lightKeys = [[0,5,.89],[8,3,.63],[12,2.6,.61]];
const liftKeys = [[0,4,.91],[5,2.6,.64],[9,3,.76],[14,1.6,.57]];
const sunKeys = [[0,4.5,.95],[4,2.3,.64],[7,3.8,.76],[12,2.6,.71]];
const returnKeys = [[0,4.7,.88],[4,2.5,.56],[8,3.6,.77],[13,2,.62]];
const closing = [
  { bass: [[0,0,3.6],[7,7,2.9],[12,-2,2.8]], keys: grooveKeys },
  { bass: [[0,0,16.5]], keys: [[0,15.5,1.04],[9,7,0.55]] },
];

// Opening rows carry groove overrides. Later rows list a chord, upper replies, and optional fill steps.
// Reply events use [sixteenth onset, MIDI note, length in sixteenths, velocity].
const opening = [
  [D, [], { kicks: [], snares: [], ghost: [], hats: [], bass: [[0,0,5.2],[10,0,3.8]], keys: openingKeys }],
  [A, [[10,93,1.3,0.65]], { kicks: [0], snares: [], ghost: [], hats: [6,14], keys: openingKeys }],
  [B, [], { kicks: [0,10], snares: [12], ghost: [], keys: openingKeys }],
  [G, [[11,90,1.4,0.7]], { kicks: [0,6,10,15], ghost: [], fill: [13,14,15], keys: openingKeys }],
  [D, []],
  [A, []],
  [B, [[9,86,1.4,0.64]]],
  [G, [], {fill: [10,13,15]}],
  [D, [[8,90,1.25,0.7]]],
  [A, []],
  [B, [[10,86,1.4,0.63]]],
  [G, [[4,95,1.2,0.7]], {fill: [9,11,13,14,15]}],
];
const glide = [
  [D, [[9,90,1.2,0.6]]],
  [A, [[9,88,1,0.56]]],
  [B, [[10,86,1.1,0.64]]],
  [G, [[11,90,1.3,0.65]], [12,14,15]],
  [Df, [[10,88,1.3,0.58]]],
  [G, [[10,90,1.25,0.67]]],
  [Em, [[10,86,1.35,0.6]]],
  [As, [[4,88,1.4,0.64]], [10,12,14,15]],
];
const lift = [
  [Bm9, [[10,93,1.2,0.63]]],
  [G, [[8.5,86,1.1,0.58]]],
  [Em, [[10,90,1.2,0.63]]],
  [GA, [[4.5,86,1.05,0.62]], [12,14,15]],
  [Df, [[9.5,93,1,0.58]]],
  [G, [[9.5,91,1,0.6]]],
  [B, [[9.5,93,1,0.6]]],
  [A, [[8.5,90,1.1,0.6]], [13,15]],
  [Em, [[10,91,1.1,0.64]]],
  [G, [[10.5,90,1.25,0.59]]],
  [Df, [[9.5,93,1,0.68]]],
  [As, [[4.5,90,1.1,0.6]], [12,14,15]],
];
const breeze = [
  [D6],
  [A],
  [Bm9],
  [G],
  [Em, [[10.5,86,1,0.46]]],
  [G],
  [Df, [[12,88,1.1,0.5]]],
  [As, [], [12,14,15]],
];
const sunburst = [
  [D, [[8.7,93,0.95,0.68],[12.8,90,1,0.6]]],
  [A, [[9.4,92,1.35,0.7]]],
  [Bm9, [[9.5,95,1.15,0.73]]],
  [G, [[10,90,1.25,0.71]], [10,13,15]],
  [Df, [[10.9,93,1.25,0.73]]],
  [G, [[8.8,95,1.05,0.69]]],
  [Em, [[9.8,93,1.1,0.67]]],
  [A, [[9.5,90,1.1,0.65]], [11,13,14,15]],
  [D, [[9,95,1.1,0.7],[12.8,93,1.1,0.66]]],
  [A, [[8.8,97,1,0.68]]],
  [B, [[9.5,95,1.25,0.75]]],
  [G, [[10,91,1.4,0.7]], [10,11,13,14,15]],
  [Em, [[10,95,1.1,0.67]]],
  [G, [[11,93,1.2,0.67]]],
  [D6, [[8.8,93,1.1,0.68]]],
  [As, [[9.5,91,1.15,0.63]], [13,15]],
];
const returning = [
  [D, [[10.6,86,1.2,0.5]]],
  [A, [[7.2,88,0.75,0.5]]],
  [Bm9, [[10.3,90,1.1,0.57]]],
  [G, [[10,88,1.3,0.55]], [13,15]],
  [D6],
  [G, [[11.4,90,1,0.52]]],
  [Em, [[10.2,86,1.1,0.54]]],
  [A, [[7.2,90,0.75,0.52]], [11,14,15]],
  [Df, [[10.3,88,1.15,0.55]]],
  [G, [[10,90,1.2,0.56]]],
  [Em, [[12.25,88,1.1,0.52]]],
  [GA, [[4.5,86,1,0.47]], [13,15]],
];
const outro = [
  [D6],
  [G],
  [As],
  [D6],
];
const plans = [[], glide, lift, breeze, sunburst, returning, outro];

function composeFrame(section, index, authored) {
  const bar = section.startBar + index;
  if (bar < 12) {
    const [chord, counter, overrides = {}] = opening[bar];
    return { ...grooveFor(bar), chord, counter, fill: [], ...overrides, bar, section: section.name, peak: false,
      drumLevel: 1, bassLevel: 1, keysLevel: 1, swell: bar === 0 ? 'normal' : null };
  }
  const [chord, counter = [], fill = []] = authored;
  const groove = grooveFor(index);
  const frame = { ...groove, bar, chord, counter, fill, section: section.name, peak: false,
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

// These events are consumed by the renderer and can also drive a future lighting score.
export function drumsFor(frame) {
  const { bar, peak, drumLevel } = frame;
  const kick = frame.kicks.map(at => ({ kind: 'kick', at, time: onset(bar, at), strength: .224 * (at ? .84 : 1) * (peak ? 1.06 : 1) * drumLevel }));
  const snare = frame.snares.map(at => ({ kind: 'snare', at, time: onset(bar, at) + .008, strength: .19 * drumLevel }));
  const ghost = frame.ghost.map(at => ({ kind: 'ghost', at, time: onset(bar, at, swing), strength: .076 * drumLevel }));
  const fill = frame.fill.map((at, i) => ({ kind: 'fill', at, time: onset(bar, at, swing / 2),
    strength: (.055 + .011 * i) * drumLevel, hatStrength: .060 * drumLevel, pan: i % 2 ? .33 : -.31 }));
  const hat = frame.hats.map((at, i) => {
    const open = at === 14 && (peak || bar % 2 === 1);
    return { kind: 'hat', at, time: onset(bar, at, swing), open, pan: i % 2 ? -.27 : .26,
      strength: .083 * (open ? 1.1 : i % 2 ? .64 : .90) * drumLevel };
  });
  return [...kick, ...snare, ...ghost, ...fill, ...hat];
}

export function rhythmTimeline() {
  const events = score.flatMap(frame => drumsFor(frame).map(event => ({ ...event, bar: frame.bar, beat: event.time / beat, section: frame.section })));
  const transitions = sections.map(section => ({
    kind: 'section', section: section.name, bar: section.startBar, time: section.start, beat: section.startBeat,
  }));
  return [...transitions, ...events].sort((a, b) => a.time - b.time);
}
