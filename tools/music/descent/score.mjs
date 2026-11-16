export const bpm = 136;
export const step = 15 / bpm;
export const bars = 48;
export const duration = bars * 16 * step;
export const tail = 1.4;
export const seed = 0xd35ce17;

export const versions = {
  A: 'DESCENT-M0-A-CONTROL',
  B: 'DESCENT-M0-B-BREACH',
};

// The pedal in ORDER gives way to D/E and an A-major lift. G is the
// borrowed flat II. C#7 supplies the leading tone into the final F# minor.
export const sections = [
  { name: 'ORDER', start: 0,  chords: 'F F F G F F D C' },
  { name: 'LOCK', start: 8,   chords: 'F F D E F A G C' },
  { name: 'FLIGHT', start: 16, chords: 'F E D D F A E C D E G C' },
  { name: 'PRESSURE', start: 28, chords: 'F G F G D E F C D G E C' },
  { name: 'BREAKTHROUGH', start: 40, chords: 'F A D E D G C F' },
];

// Bass, three-note signal, and tightly spaced chord. MIDI pitches.
export const harmony = {
  F: [30, [66, 73, 68], [54, 57, 61, 68]],
  D: [38, [62, 69, 64], [54, 57, 62, 64]],
  E: [28, [64, 71, 66], [55, 59, 64, 66]],
  A: [33, [64, 69, 71], [52, 57, 61, 71]],
  G: [31, [67, 74, 69], [55, 59, 62, 69]],
  C: [37, [65, 68, 71], [53, 56, 59, 61]],
};
const phrases = sections.flatMap(({ name, chords, start }) =>
  chords.split(' ').map((key, index) => ({ name, key, index, bar: start + index })));

// Each drum cell is a bar on a sixteenth grid. The last column supplies
// the phrase turnover. Drums only ornament openings left by the motif.
const rhythm = {
  A: {
    ORDER: [
      [[0, 8], [], [6, 14]], [[0, 8, 13], [12], [2, 6, 10, 14]],
      [[0, 4, 8], [4, 12], [2, 6, 10, 14]], [[0, 6, 8, 12], [4, 12], [2, 6, 10, 15]],
    ],
    LOCK: [
      [[0, 4, 8, 11, 12], [4, 12], [2, 6, 10, 14]],
      [[0, 3, 6, 8, 12], [4, 12], [2, 6, 10, 14, 15]],
      [[0, 4, 8, 12, 14], [4, 12], [2, 5, 6, 10, 14]],
      [[0, 4, 7, 10, 12], [4, 12], [2, 6, 9, 14]],
    ],
    FLIGHT: [
      [[0, 4, 8, 12, 15], [4, 12], [2, 6, 10, 13, 14]],
      [[0, 4, 7, 8, 12], [4, 12], [2, 6, 10, 14, 15]],
      [[0, 3, 4, 8, 12], [4, 12], [2, 6, 10, 14]],
      [[0, 4, 8, 10], [4, 12], [2, 6, 9, 11, 14]],
    ],
    PRESSURE: [
      [[0, 4, 8, 12], [4, 12], [2, 3, 6, 10, 11, 14]],
      [[0, 4, 6, 8, 12, 15], [4, 12], [2, 6, 10, 14]],
      [[0, 4, 8, 11, 12], [4, 12], [1, 2, 6, 7, 10, 14]],
      [[0, 4, 7, 8, 10, 12], [4, 12], [2, 6, 10, 13, 15]],
    ],
    BREAKTHROUGH: [
      [[0, 4, 8, 12], [4, 12], [2, 6, 10, 14]],
      [[0, 6, 8, 12], [4, 12], [2, 6, 10, 14]],
      [[0, 4, 8], [4, 12], [2, 6, 10]],
      [[0, 8], [4, 12], [2, 6, 14]],
    ],
  },
  B: {
    ORDER: [
      [[0, 7], [], [3, 10]], [[0, 6, 10], [12], [2, 8, 14]],
      [[0, 3, 10], [4, 12], [2, 6, 8, 14]], [[0, 7, 11], [4, 13], [2, 5, 9, 15]],
    ],
    LOCK: [
      [[0, 3, 7, 10], [4, 12], [2, 6, 8, 11, 14]],
      [[0, 6, 10, 15], [4, 12], [2, 5, 8, 13, 14]],
      [[0, 2, 8, 11], [4, 14], [3, 6, 9, 12, 15]],
      [[0, 5, 7, 10], [4, 12], [2, 6, 9, 14]],
    ],
    FLIGHT: [
      [[0, 3, 8, 10, 15], [4, 12], [2, 5, 6, 9, 14]],
      [[0, 6, 9, 11], [4, 12], [2, 5, 8, 10, 14, 15]],
      [[0, 2, 7, 10, 13], [4, 12], [3, 5, 8, 11, 14]],
      [[0, 3, 6, 11], [4, 14], [2, 7, 8, 12, 15]],
    ],
    PRESSURE: [
      [[0, 3, 7, 10, 13], [4, 12], [2, 5, 6, 8, 11, 14]],
      [[0, 2, 6, 9, 15], [4, 11], [3, 5, 7, 10, 12, 14]],
      [[0, 5, 7, 10, 14], [4, 12], [2, 3, 6, 8, 11, 15]],
      [[0, 2, 6, 8, 11, 15], [4, 13], [3, 5, 7, 9, 12, 14]],
    ],
    BREAKTHROUGH: [
      [[0, 3, 8, 10], [4, 12], [2, 6, 9, 14]],
      [[0, 6, 11, 15], [4, 12], [2, 5, 8, 14]],
      [[0, 7, 10], [4, 13], [2, 6, 9, 14]],
      [[0, 6], [12], [2, 8, 14]],
    ],
  },
};

// Offset, length in sixteenths, and articulation, all in the chord's low register.
const bassLines = {
  A: {
    ORDER: [[1, 2.1, .72], [9, 2.0, .57]],
    LOCK: [[1, 1.7, .83], [3, 1.0, .51], [6, 1.4, .67], [9, 2.0, .77], [14, 1.4, .58]],
    FLIGHT: [[1, 2.5, .88], [6, 1.2, .55], [9, 1.5, .77], [13, 1.8, .74]],
    PRESSURE: [[1, 1.5, .93], [3, .9, .50], [5, 1.6, .76], [9, 1.8, .82], [13, 1.8, .72]],
    BREAKTHROUGH: [[1, 3.5, .79], [9, 2.4, .63]],
  },
  B: {
    ORDER: [[1, 3.3, .64], [10, 2.0, .59]],
    LOCK: [[1, 2.8, .82], [8, 1.5, .61], [11, 3.0, .80]],
    FLIGHT: [[1, 3.5, .91], [7, 2.1, .71], [11, 2.2, .75], [14, 1.2, .56]],
    PRESSURE: [[1, 2.6, .92], [5, 1.4, .66], [8, 2.6, .82], [13, 2.1, .79]],
    BREAKTHROUGH: [[1, 4.2, .84], [10, 3.5, .69]],
  },
};

// Drum breaks leave a gap ahead of a new phrase. Pressure briefly loses
// its low end at bars 35–36 before the fullest statement of the groove.
const cutoffs = { 7: 12, 15: 13, 23: 12, 27: 10, 34: 9, 35: 12, 39: 10, 45: 12, 46: 9 };
const transitions = new Set([7, 15, 27, 35, 39, 46]);

export function makeScore(version) {
  if (!Object.hasOwn(versions, version)) throw new RangeError('Choose A or B.');
  const breach = version === 'B';
  const events = [];
  for (const { name, key, index, bar } of phrases) {
    const [root, motif, chord] = harmony[key];
    const phraseEnd = index % 4 === 3;
    const cut = cutoffs[bar] ?? 16;
    const put = (voice, offset, velocity, extra = {}) => {
      const swing = breach && Number.isInteger(offset) && offset % 2 ? .009 : 0;
      events.push({ voice, at: (bar * 16 + offset) * step + swing, velocity, ...extra });
    };
    if (bar === 47) {
      put('kick', 0, .87);
      put('bass', 1, .79, { note: root, length: .42 });
      put('signal', 0, .63, { note: motif[1], length: .17, pan: -.24 });
      put('signal', 4, .53, { note: motif[2], length: .14, pan: .23 });
      put('signal', 8, .72, { note: motif[0], length: .31, pan: -.05 });
      put('chord', 8, .79, { notes: chord, length: .75 });
      continue;
    }
    const [kicks, snares, hats] = rhythm[version][name][index % 4];
    const percussionBreak = bar === 35;
    for (const hit of kicks) {
      if (hit < cut && (!percussionBreak || hit === 0)) put('kick', hit, hit === 0 ? 1 : hit % 4 === 0 ? .83 : .73);
    }
    for (const hit of snares) {
      if (hit < cut) put('snare', hit, hit >= 12 ? .87 : .97);
    }
    if (bar >= 3 && (breach || phraseEnd)) {
      const ghosts = phraseEnd ? [3, 11, 14] : index % 2 === 0 ? [5, 15] : [2, 9];
      for (const hit of ghosts) if (hit < cut && !snares.includes(hit) && !kicks.includes(hit)) put('ghost', hit, hit === 14 ? .41 : .27);
    }
    for (const hit of hats) if (hit < cut) {
      put('hat', hit, hit % 4 === 2 ? .76 : .40, { pan: hit < 8 ? -.24 : .32, open: hit === 14 && index % 2 === 0 });
    }
    if (bar > 1 && bar !== 35) for (const [offset, length, velocity] of bassLines[version][name]) {
      const hit = offset + (breach && offset === 7 && kicks.includes(7) ? 1 : 0);
      if (hit + .75 < cut) put('bass', hit, velocity, { note: root, length: Math.min(length, cut - hit) * step });
    }
    // Short chords are rhythmic punctuation. Their absence exposes the drums.
    if (bar === 0 || (bar >= 4 && index % 2 === 0) || (name === 'PRESSURE' && bar >= 36 && bar !== 39)) {
      put('chord', bar === 0 ? 0 : breach ? 7 : 2, name === 'PRESSURE' ? .83 : .70,
        { notes: chord, length: breach ? .30 : .22 });
    }
    if (bar >= 16 && index % 4 === 2 && cut >= 15) put('chord', 14, .49, { notes: chord, length: .14 });
    if (index % 4 === 0 || index % 4 === 2 || bar === 35) {
      const form = bar === 35 ? [[1, 2], [5, 1], [8, 0]]
        : name === 'PRESSURE' ? [[1, 0], [5, 2], [8, 1]]
        : index % 4 === 2 ? [[5, 1], [10, 2], [13, 0]]
        : [[2, 0], [6, 1], [9, 2]];
      for (const [j, [offset, degree]] of form.entries()) {
        const hit = offset + (breach && j === 1 ? 1 : 0);
        if (hit < cut) put('signal', hit, [.81, .58, .64][j], {
          note: motif[degree], length: j === 2 ? .21 : .12, pan: [-.18, .28, -.08][j],
        });
      }
    } else if (!phraseEnd && bar > 3) {
      put('signal', 11, .48, { note: motif[0], length: .13, pan: .24 });
    }
    if ((breach && bar > 4) || (bar > 3 && index % 2 === 1)) {
      for (const hit of breach && index % 2 ? [5, 13] : [11]) {
        if (hit < cut && !snares.includes(hit)) put('metal', hit, hit === 13 ? .79 : .58,
          { pan: hit === 5 ? -.38 : .36, note: motif[hit === 5 ? 0 : 1] - 12 });
      }
    }
    if (transitions.has(bar)) {
      const from = bar === 35 ? 8 : 11;
      put('sweep', from, name === 'PRESSURE' ? .83 : .63, { length: (16 - from) * step, falling: bar === 46 });
      if (breach && bar !== 46) put('ghost', 15, .48);
    }
  }
  return events.sort((a, b) => a.at - b.at);
}
