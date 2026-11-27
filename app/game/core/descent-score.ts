export const bpm = 136;
export const step = 15 / bpm;
export const seed = 0xd35ce17;

export type DescentEvent = { at: number; velocity: number } & (
  | { voice: 'kick' | 'snare' | 'ghost' }
  | { voice: 'hat'; pan: number; open: boolean }
  | { voice: 'bass'; note: number; length: number }
  | { voice: 'signal'; note: number; length: number; pan: number }
  | { voice: 'chord'; notes: readonly number[]; length: number }
  | { voice: 'metal'; note: number; pan: number }
  | { voice: 'sweep'; length: number; falling: boolean }
);

// Bass, three-note signal, and tightly spaced chord. MIDI pitches.
export const harmony = {
  F: [30, [66, 73, 68], [54, 57, 61, 68]],
  D: [38, [62, 69, 64], [54, 57, 62, 64]],
  E: [28, [64, 71, 66], [55, 59, 64, 66]],
  A: [33, [64, 69, 71], [52, 57, 61, 71]],
  G: [31, [67, 74, 69], [55, 59, 62, 69]],
  C: [37, [65, 68, 71], [53, 56, 59, 61]],
} as const;

// The full arrangement quotes the first eight bars of prototype CONTROL.
export function makeControlOpening(): DescentEvent[] {
  const cells = [
    [[0, 8], [], [6, 14]], [[0, 8, 13], [12], [2, 6, 10, 14]],
    [[0, 4, 8], [4, 12], [2, 6, 10, 14]], [[0, 6, 8, 12], [4, 12], [2, 6, 10, 15]],
  ];
  const events: DescentEvent[] = [];
  for (const [bar, key] of (['F', 'F', 'F', 'G', 'F', 'F', 'D', 'C'] as const).entries()) {
    const [root, motif, chord] = harmony[key];
    const cut = bar === 7 ? 12 : 16;
    const [kicks, snares, hats] = cells[bar % 4];
    const put = (voice: DescentEvent['voice'], hit: number, velocity: number, extra = {}) =>
      events.push({ voice, at: (bar * 16 + hit) * step, velocity, ...extra } as DescentEvent);
    for (const hit of kicks) if (hit < cut) put('kick', hit, hit === 0 ? 1 : hit % 4 === 0 ? .83 : .73);
    for (const hit of snares) if (hit < cut) put('snare', hit, hit >= 12 ? .87 : .97);
    if (bar === 3 || bar === 7) {
      for (const hit of [3, 11, 14]) if (hit < cut && !snares.includes(hit) && !kicks.includes(hit)) {
        put('ghost', hit, hit === 14 ? .41 : .27);
      }
    }
    for (const hit of hats) if (hit < cut) {
      put('hat', hit, hit % 4 === 2 ? .76 : .40, { pan: hit < 8 ? -.24 : .32, open: hit === 14 && bar % 2 === 0 });
    }
    if (bar > 1) {
      put('bass', 1, .72, { note: root, length: Math.min(2.1, cut - 1) * step });
      put('bass', 9, .57, { note: root, length: Math.min(2.0, cut - 9) * step });
    }
    if (bar === 0 || (bar >= 4 && bar % 2 === 0)) {
      put('chord', bar === 0 ? 0 : 2, .70, { notes: chord, length: .22 });
    }
    if (bar % 2 === 0) {
      const motifForm = bar % 4 === 2 ? [[5, 1], [10, 2], [13, 0]] : [[2, 0], [6, 1], [9, 2]];
      for (const [j, [hit, degree]] of motifForm.entries()) {
        put('signal', hit, [.81, .58, .64][j], { note: motif[degree], length: j === 2 ? .21 : .12, pan: [-.18, .28, -.08][j] });
      }
    } else if (bar === 5) {
      put('signal', 11, .48, { note: motif[0], length: .13, pan: .24 });
    }
    if (bar > 3 && bar % 2 === 1 && !snares.includes(11)) put('metal', 11, .58, { pan: .36, note: motif[1] - 12 });
    if (bar === 7) put('sweep', 11, .63, { length: 5 * step, falling: false });
  }
  return events.sort((a, b) => a.at - b.at);
}

const fullBars = 96;
const beatsPerBar = 4;

// Four bars per row. Each column gives the harmony, groove, signal
// and chord punctuation. Dots leave the corresponding voice silent.
const sections = [
  { name: 'ORDER', start: 0, phrases: [] },
  { name: 'LOCK', start: 8, phrases: [
    ['F F D E', 'drive pickup drive check', 'a.r.', '.x.x'],
    ['F A G C', 'drive skip answer brake', 'a..r', 'x..y'],
    ['F D F E', 'pickup drive skip drive', '.ra.', 'x.x.'],
    ['D E G C', 'answer pickup check brake', 'a..q', '.x.y'],
  ] },
  { name: 'FLIGHT', start: 24, phrases: [
    ['F E D D', 'rush relay rush bank', 'r.a.', 'x..y'],
    ['F A E C', 'relay rush chase check', 'a..q', '.xx.'],
    ['D E F A', 'chase rush relay chase', '.r.a', 'x..x'],
    ['D F E C', 'bank relay rush brake', 'a.r.', 'y..x'],
    ['D E G C', 'relay chase answer bank', '.a.q', '.xy.'],
  ] },
  { name: 'PRESSURE', start: 44, phrases: [
    ['F G F G', 'press clamp press latch', 't.t.', '.x.y'],
    ['D E F C', 'relay press clamp check', 'r..q', 'x.x.'],
    ['G G D C', 'clamp latch press brake', 't..q', 'y..y'],
    ['F G F D', 'press clamp relay press', '.t.r', '.xy.'],
    ['G E G C', 'latch press clamp latch', 't..q', 'y.x.'],
  ] },
  { name: 'HOLD', start: 64, phrases: [
    ['C F D G', 'void void pulse void', 'h.ll', '.z..'],
    ['F E G C', 'pulse idle pulse count', '.llq', 'z..z'],
  ] },
  { name: 'LOCKDOWN', start: 72, phrases: [
    ['F F D G', 'strike ram strike bolt', 'k.rl', 'yy.y'],
    ['F A E C', 'ram bolt strike latch', 't.kr', 'x.yy'],
    ['D E F G', 'strike chase ram strike', 'r.kt', 'y.yy'],
    ['F G E C', 'bolt strike ram brake', 'k.rt', 'yy.y'],
  ] },
  { name: 'BREACH', start: 88, phrases: [
    ['F A D E', 'release carry release drift', 'a.r.', 'x..x'],
    ['D G C F', 'carry drift close void', '.l..', 'x.z.'],
  ] },
] as const;
export const controlTrack = Object.freeze({
  id: 'control',
  title: 'DESCENT — CONTROL',
  bpm,
  beatsPerBar,
  bars: fullBars,
  beats: fullBars * beatsPerBar,
  duration: fullBars * 16 * step,
  tail: 1.6,
  sections: Object.freeze(sections.map(({ name, start }, i) => Object.freeze({
    name,
    startBeat: start * beatsPerBar,
    endBeat: (sections[i + 1]?.start ?? fullBars) * beatsPerBar,
  }))),
});

const quarters = [0, 4, 8, 12];
const backbeat = [4, 12];
const offbeats = [2, 6, 10, 14];
// Kick, snare, hat, ghost notes and bass phrase. Offsets are straight sixteenths.
const grooves = {
  drive:   [[0, 4, 8, 11, 12], backbeat, offbeats, [], 'piston'],
  pickup:  [[0, 3, 4, 8, 12], backbeat, [2, 6, 10, 14, 15], [], 'piston'],
  check:   [[0, 4, 8, 10, 12], backbeat, [2, 6, 9, 14], [15], 'reply'],
  skip:    [[0, 4, 7, 8, 12], backbeat, [2, 5, 10, 14], [], 'reply'],
  answer:  [[0, 4, 8, 12, 14], backbeat, [2, 6, 10, 13], [11], 'reply'],
  brake:   [[0, 4, 8], [4], [2, 6, 9], [10], 'short'],
  rush:    [[0, 4, 8, 12, 15], backbeat, [2, 6, 10, 13, 14], [], 'run'],
  relay:   [[0, 4, 7, 8, 12], backbeat, [2, 6, 9, 10, 14], [15], 'run'],
  chase:   [[0, 3, 4, 8, 11, 12], backbeat, [2, 6, 10, 14], [15], 'reply'],
  bank:    [[0, 4, 8, 10], [4, 12], [2, 6, 9, 11, 14], [15], 'short'],
  press:   [[0, 4, 8, 10, 12], backbeat, [2, 3, 6, 7, 10, 14], [], 'threat'],
  clamp:   [[0, 4, 6, 8, 12, 15], backbeat, [2, 5, 10, 14], [11], 'run'],
  latch:   [[0, 4, 8], [4, 10], [2, 6, 9], [11], 'short'],
  void:    [[], [], [], [], 'rest'],
  pulse:   [[0], [], [], [], 'rest'],
  idle:    [[], [], [6, 14], [], 'rest'],
  count:   [[0, 8], [], [6, 10, 14], [13, 15], 'trace'],
  strike:  [[0, 4, 7, 8, 11, 12], backbeat, [2, 5, 6, 10, 13, 14], [15], 'surge'],
  ram:     [[0, 3, 4, 8, 12, 15], backbeat, [2, 6, 7, 10, 14], [11], 'run'],
  bolt:    [[0, 4, 6, 8, 10, 12], backbeat, offbeats, [5, 15], 'threat'],
  release: [quarters, backbeat, offbeats, [], 'out'],
  carry:   [[0, 4, 8, 14], backbeat, [2, 6, 10], [], 'out'],
  drift:   [[0, 8, 12], [4, 12], [2, 10], [], 'out'],
  close:   [[0, 8], [4], [6], [], 'trace'],
} as const;

// Offset, duration in steps, and velocity. All bass movement sits in the low register.
const bass = {
  piston: [[1, 1.8, .83], [3, .8, .47], [6, 1.3, .63], [9, 2, .78], [14, 1.4, .59]],
  reply:  [[1, 2.1, .85], [6, 1.4, .62], [9, 1.5, .76], [13, 1.8, .69]],
  run:    [[1, 1.6, .88], [5, 1.9, .70], [9, 1.8, .82], [13, 1.7, .70]],
  short:  [[1, 2, .77], [6, 1.1, .63], [9, 1.5, .68]],
  threat: [[1, 1.6, .88], [3, .85, .46], [5, 1.7, .69], [9, 1.45, .83], [13, 1.5, .76]],
  surge:  [[1, 1.8, .91], [5, 1.3, .72], [9, 1.5, .85], [13, 1.45, .8], [15, .72, .49]],
  trace:  [[9, 2.4, .55]],
  out:    [[1, 3.1, .78], [10, 2.3, .60]],
  rest:   [],
};

// The signal is quoted, displaced, inverted, or compressed before a reply.
// Each entry gives the offset, index in the chord's motif, and articulation.
const signals = {
  a: [[2, 0, .80], [6, 1, .56], [9, 2, .66]],
  r: [[5, 1, .63], [9, 2, .51], [13, 0, .74]],
  t: [[1, 0, .80], [5, 2, .61], [8, 1, .67]],
  h: [[1, 2, .56], [7, 1, .48], [13, 0, .64]],
  k: [[1, 0, .88], [3, 1, .64], [6, 2, .76]],
  l: [[5, 0, .51]],
  q: [[3, 2, .54], [8, 0, .70]],
  '.': [],
};
const stabs = {
  x: [[2, .18, .70]],
  y: [[6, .19, .81], [13, .13, .51]],
  z: [[1, .32, .57]],
  '.': [],
};
// Selected turnarounds bring a snare fill, a metal answer, or a short noise transition.
const fills = new Map([
  [15, [9, 13]], [23, [11, 14]], [31, [13, 15]], [39, [11, 14]],
  [43, [12, 15]], [47, [12, 15]], [55, [11, 14]], [62, [5, 13]],
  [75, [11, 13]], [79, [12, 15]], [83, [7, 15]], [87, [11, 14]], [91, [13]],
]);
const metal = new Map([
  [10, [11]], [17, [7]], [22, [11]], [25, [11]], [28, [7]], [34, [11]],
  [37, [7, 13]], [42, [11]], [45, [11]], [49, [7]], [53, [11]], [56, [7, 13]],
  [60, [11]], [65, [10]], [68, [12]], [73, [7, 13]], [76, [11]], [78, [5, 13]],
  [80, [7]], [82, [11]], [84, [7, 13]], [86, [11]], [90, [7]],
]);
const transitions = new Map([[23, 12], [43, 12], [55, 12], [63, 11], [71, 10], [79, 13], [87, 12], [94, 10]]);

export function makeFullScore() {
  const events = makeControlOpening();
  for (const { name, start, phrases } of sections) {
    for (const [phrase, [keys, cells, forms, accents]] of phrases.entries()) {
      for (const [i, key] of keys.split(' ').entries()) {
        const bar = start + phrase * 4 + i;
        const [root, motif, chord] = harmony[key as keyof typeof harmony];
        const put = (voice: DescentEvent['voice'], offset: number, velocity: number, extra = {}) =>
          events.push({ voice, at: (bar * 16 + offset) * step, velocity, ...extra } as DescentEvent);
        if (bar === fullBars - 1) {
          put('kick', 0, .73);
          put('bass', 1, .73, { note: root, length: .64 });
          put('signal', 0, .57, { note: motif[1], length: .17, pan: -.19 });
          put('signal', 5, .54, { note: motif[2], length: .21, pan: .22 });
          put('signal', 10, .64, { note: motif[0], length: .35, pan: -.04 });
          put('chord', 10, .74, { notes: chord, length: .94 });
          continue;
        }
        const [kicks, snares, hats, ghosts, line] = grooves[cells.split(' ')[i] as keyof typeof grooves];
        for (const hit of kicks) {
          const level = name === 'HOLD' ? .39 : hit === 0 ? 1 : hit % 4 === 0 ? .86 : .72;
          put('kick', hit, level);
        }
        for (const hit of snares) put('snare', hit, hit === 4 ? .97 : .89);
        for (const hit of hats) put('hat', hit, hit % 4 === 2 ? .72 : .42, {
          pan: hit < 8 ? -.25 : .28, open: hit === 14 && (i === 0 || name === 'LOCKDOWN'),
        });
        for (const hit of new Set([...ghosts, ...(fills.get(bar) ?? [])])) {
          if (!(snares as readonly number[]).includes(hit) && !(kicks as readonly number[]).includes(hit)) put('ghost', hit, hit >= 13 ? .44 : .32);
        }
        for (const [offset, length, velocity] of bass[line]) {
          put('bass', offset, velocity, { note: root, length: length * step });
        }
        for (const [j, [offset, degree, velocity]] of signals[forms[i] as keyof typeof signals].entries()) {
          const length = name === 'HOLD' ? .26 : j === 2 ? .21 : .12;
          put('signal', offset, velocity, { note: motif[degree], length, pan: [-.20, .23, -.06][j] });
        }
        for (const [offset, length, velocity] of stabs[accents[i] as keyof typeof stabs]) put('chord', offset, velocity, { notes: chord, length });
        for (const hit of metal.get(bar) ?? []) put('metal', hit, .61, {
          note: motif[hit > 8 ? 1 : 0] - 12, pan: hit > 8 ? .32 : -.36,
        });
        const from = transitions.get(bar);
        if (from !== undefined) put('sweep', from, bar === 71 ? .78 : .60, {
          length: (16 - from) * step, falling: bar === 63 || bar === 94,
        });
      }
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

export const controlEvents: readonly DescentEvent[] = makeFullScore();

export function stepsForDescent(events: readonly DescentEvent[], bars: number) {
  const steps = Array.from({ length: bars * 16 }, () => [] as number[]);
  events.forEach(({ at }, index) => steps[Math.floor(at / step + 1e-9)].push(index));
  return steps;
}

export const controlSteps = stepsForDescent(controlEvents, controlTrack.bars);

export const controlSignalWindow = ['FLIGHT', 'BREACH'].map(name =>
  controlTrack.sections.find(section => section.name === name)!.startBeat * 4 * step);
