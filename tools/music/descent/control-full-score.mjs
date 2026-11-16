import { harmony, makeScore, step } from './score.mjs';

export const fullBars = 96;
export const fullDuration = fullBars * 16 * step;
export const fullTail = 1.6;
export const fullName = 'DESCENT-M0-A1-CONTROL-FULL';

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
];
export const fullSections = sections.map(({ name, start }, i) => ({
  name, start, end: sections[i + 1]?.start ?? fullBars,
}));

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
};

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
  const opening = sections[1].start;
  const events = makeScore('A').filter(({ at }) => at < opening * 16 * step);
  for (const { name, start, phrases } of sections) {
    for (const [phrase, [keys, cells, forms, accents]] of phrases.entries()) {
      for (const [i, key] of keys.split(' ').entries()) {
        const bar = start + phrase * 4 + i;
        const [root, motif, chord] = harmony[key];
        const put = (voice, offset, velocity, extra) =>
          events.push({ voice, at: (bar * 16 + offset) * step, velocity, ...extra });
        if (bar === fullBars - 1) {
          put('kick', 0, .73);
          put('bass', 1, .73, { note: root, length: .64 });
          put('signal', 0, .57, { note: motif[1], length: .17, pan: -.19 });
          put('signal', 5, .54, { note: motif[2], length: .21, pan: .22 });
          put('signal', 10, .64, { note: motif[0], length: .35, pan: -.04 });
          put('chord', 10, .74, { notes: chord, length: .94 });
          continue;
        }
        const [kicks, snares, hats, ghosts, line] = grooves[cells.split(' ')[i]];
        for (const hit of kicks) {
          const level = name === 'HOLD' ? .39 : hit === 0 ? 1 : hit % 4 === 0 ? .86 : .72;
          put('kick', hit, level);
        }
        for (const hit of snares) put('snare', hit, hit === 4 ? .97 : .89);
        for (const hit of hats) put('hat', hit, hit % 4 === 2 ? .72 : .42, {
          pan: hit < 8 ? -.25 : .28, open: hit === 14 && (i === 0 || name === 'LOCKDOWN'),
        });
        for (const hit of new Set([...ghosts, ...(fills.get(bar) ?? [])])) {
          if (!snares.includes(hit) && !kicks.includes(hit)) put('ghost', hit, hit >= 13 ? .44 : .32);
        }
        for (const [offset, length, velocity] of bass[line]) {
          put('bass', offset, velocity, { note: root, length: length * step });
        }
        for (const [j, [offset, degree, velocity]] of signals[forms[i]].entries()) {
          const length = name === 'HOLD' ? .26 : j === 2 ? .21 : .12;
          put('signal', offset, velocity, { note: motif[degree], length, pan: [-.20, .23, -.06][j] });
        }
        for (const [offset, length, velocity] of stabs[accents[i]]) put('chord', offset, velocity, { notes: chord, length });
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
