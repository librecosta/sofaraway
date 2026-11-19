export const bpm = 128;
export const beatsPerBar = 4;
export const bars = 48;
export const beatSeconds = 60 / bpm;
export const step = beatSeconds / 4;
export const duration = bars * beatsPerBar * beatSeconds;
export const tail = 4;
export const seed = 0x41535452;
export const versions = { A: 'ORBIT-M0-A-GRAVITY', B: 'ORBIT-M0-B-STARWAKE' };

let cursor = 0;
export const sections = [
  ['OUTER BELT', 4], ['DRIFT', 8], ['RINGBREAK', 8], ['MAELSTROM', 8],
  ['ECLIPSE', 4], ['AURORA', 8], ['APHELION', 8],
].map(([name, count]) => {
  const startBar = cursor;
  cursor += count;
  return { name, bars: count, startBar, endBar: cursor, startBeat: startBar * 4,
    endBeat: cursor * 4, start: startBar * 4 * beatSeconds, end: cursor * 4 * beatSeconds };
});

// Each row is an authored four-bar phrase. Repeated chords support evolving
// voicings, counter-rhythms and cadences rather than a repeated backing loop.
export const progressions = {
  A: [
    'Dm Dm Bb Cs', 'Dm Dm Bb Gm', 'F C Em7b5 A7', 'Dm Bb Gm Cs',
    'Bb F Em7b5 A7', 'Dm Eb Gm A7', 'Bb Gm Em7b5 A7', 'Dm Eb Asus A7',
    'Bb F C Dm', 'Gm Bb Cs A7', 'Dm Bb F Cs', 'Gm A7 Dm Dm',
  ],
  B: [
    'F F Bb Cs', 'F C Dm Bb', 'Gm Cs F A7', 'Bb F C Dm',
    'Gm Bb Cs C', 'Dm Bb Gm A7', 'Eb Bb Em7b5 A7', 'Dm Gm Asus A7',
    'Bb F C Dm', 'Gm F Bb Cs', 'F C Bb Gm', 'Dm Cs F F',
  ],
};

export const harmony = {
  Dm: { root: 38, notes: [53, 57, 60, 64], arp: [62, 65, 69, 72, 76] },
  Bb: { root: 34, notes: [53, 57, 60, 62], arp: [62, 65, 69, 72, 74] },
  F: { root: 41, notes: [53, 57, 60, 67], arp: [60, 65, 67, 69, 72] },
  C: { root: 36, notes: [52, 55, 60, 62], arp: [60, 64, 67, 69, 74] },
  Cs: { root: 36, notes: [50, 55, 60, 62], arp: [60, 62, 67, 69, 74] },
  Gm: { root: 31, notes: [53, 57, 58, 62], arp: [62, 65, 67, 69, 70] },
  Eb: { root: 39, notes: [55, 58, 62, 65], arp: [62, 65, 67, 70, 74] },
  Em7b5: { root: 40, notes: [55, 58, 62, 64], arp: [62, 64, 67, 70, 74] },
  Asus: { root: 33, notes: [55, 57, 62, 64], arp: [61, 64, 67, 69, 74] },
  A7: { root: 33, notes: [55, 57, 61, 64], arp: [61, 64, 67, 69, 73] },
};

// Sixteenths within a bar. A's broken downbeats and displaced responses differ
// from B's longer, grounded stride. The four columns make complete phrases.
const grooves = {
  A: {
    DRIFT: [[[0, 7, 10], [4, 12], [2, 6, 9, 14]], [[0, 5, 11], [4, 12], [2, 7, 10, 14]],
      [[0, 6, 10, 15], [4, 12], [2, 6, 8, 11, 14]], [[0, 7, 10], [4, 12], [2, 5, 10, 14]]],
    RINGBREAK: [[[0, 3, 7, 10], [4, 12], [2, 5, 6, 10, 14]], [[0, 6, 11, 14], [4, 12], [2, 7, 9, 14]],
      [[0, 5, 8, 11], [4, 12], [2, 6, 10, 13, 14]], [[0, 3, 10], [4, 12], [2, 6, 9, 14]]],
    MAELSTROM: [[[0, 3, 7, 10, 14], [4, 12], [2, 5, 6, 9, 10, 14]], [[0, 6, 8, 11, 15], [4, 12], [2, 6, 10, 13, 14]],
      [[0, 3, 9, 10], [4, 12], [2, 5, 7, 10, 14]], [[0, 6, 10], [4, 12], [2, 6, 9, 14]]],
    AURORA: [[[0, 7, 8, 10], [4, 12], [2, 6, 10, 14]], [[0, 5, 10, 14], [4, 12], [2, 6, 9, 14]],
      [[0, 6, 8, 11], [4, 12], [2, 6, 10, 13, 14]], [[0, 7, 10], [4, 12], [2, 6, 9, 14]]],
  },
  B: {
    DRIFT: [[[0, 4, 8], [4, 12], [2, 6, 10, 14]], [[0, 4, 8, 14], [4, 12], [2, 6, 10, 14]],
      [[0, 4, 8, 12], [4, 12], [2, 6, 10, 14]], [[0, 6, 8], [4, 12], [2, 6, 11, 14]]],
    RINGBREAK: [[[0, 4, 8, 12], [4, 12], [2, 6, 10, 14]], [[0, 4, 8, 11, 12], [4, 12], [2, 6, 10, 14]],
      [[0, 4, 8, 12, 15], [4, 12], [2, 6, 10, 14, 15]], [[0, 4, 10], [4, 12], [2, 6, 10, 14]]],
    MAELSTROM: [[[0, 4, 8, 12], [4, 12], [2, 6, 10, 14]], [[0, 3, 4, 8, 12], [4, 12], [2, 6, 10, 14]],
      [[0, 4, 8, 12, 14], [4, 12], [2, 6, 9, 10, 14]], [[0, 4, 8], [4, 12], [2, 6, 10, 14]]],
    AURORA: [[[0, 4, 8, 12], [4, 12], [2, 6, 10, 14]], [[0, 4, 8, 12], [4, 12], [2, 6, 10, 14, 15]],
      [[0, 4, 8, 12, 15], [4, 12], [2, 6, 10, 14]], [[0, 4, 8, 12], [4, 12], [2, 6, 10, 14]]],
  },
};

// Beat offset from the phrase, pitch, duration in beats. A's falling minor
// cell returns expanded in AURORA; B's rising fifth opens into a long answer.
export const themes = {
  A: [[.75, 74, .65], [2.5, 69, .65], [4.75, 72, 1.2], [7.25, 76, .6],
    [9, 77, 1.1], [10.5, 76, .65], [12.5, 72, 1.2], [14.25, 69, 1.0]],
  B: [[0, 69, 1.2], [1.5, 72, .8], [3, 77, 2.2], [6, 76, 1.2],
    [8, 72, 1.4], [10, 74, 2.1], [13, 69, 1.5], [15, 67, .65]],
};

const answers = {
  A: [[0, 77, 1.2], [2, 76, .7], [3.5, 72, 1.2], [6, 69, 1.2],
    [8.75, 67, .75], [10, 69, .8], [12, 73, 1], [14.25, 76, 1.0]],
  B: [[0, 74, 1.5], [2, 72, 1.0], [4, 69, 2.3], [7, 67, .7],
    [8, 70, 1.4], [10, 69, 1.0], [12, 67, 1.5], [14, 74, 1.2]],
};

export function makeScore(version) {
  if (!Object.hasOwn(versions, version)) throw new RangeError('Choose A or B.');
  const events = [];
  const chords = progressions[version].flatMap(row => row.split(' '));
  const add = (voice, bar, offset, velocity, details = {}) => {
    const beat = bar * 4 + offset / 4;
    const section = sections.find(part => bar >= part.startBar && bar < part.endBar).name;
    events.push({ voice, bar, beat, at: beat * beatSeconds, velocity, section,
      accent: voice === 'kick' || voice === 'lead', fill: false, ...details });
  };
  for (let bar = 0; bar < bars; bar++) {
    const section = sections.find(part => bar >= part.startBar && bar < part.endBar);
    const local = bar - section.startBar;
    const phrase = Math.floor(bar / 4);
    const cell = bar % 4;
    const chord = harmony[chords[bar]];
    const eclipse = section.name === 'ECLIPSE';
    const intro = section.name === 'OUTER BELT';
    const ending = section.name === 'APHELION';
    const cutoff = ({ 3: 12, 11: 14, 19: 12, 27: 10, 31: 8, 39: 14, 45: 11, 46: 8, 47: 0 })[bar] ?? 16;
    const active = section.name === 'MAELSTROM' || section.name === 'AURORA';
    const drumLevel = active ? .94 : .84;
    let pattern = grooves[version][section.name] ?? grooves[version].DRIFT;
    if (ending) pattern = grooves[version].AURORA;
    let [kicks, snares, hats] = pattern[cell];
    if (intro) {
      kicks = bar < 2 ? [] : bar === 2 ? [0] : [0, 10];
      snares = bar === 3 ? [12] : [];
      hats = bar === 0 ? [] : bar === 1 ? [6, 14] : [2, 6, 10, 14];
    } else if (eclipse) {
      kicks = local === 0 ? [0] : local === 3 ? [0] : [];
      snares = [];
      hats = local === 1 ? [6, 14] : [];
    } else if (ending && local >= 4) {
      kicks = local === 4 ? [0, 8] : local === 5 ? [0] : local === 6 ? [0] : [];
      snares = local === 4 ? [12] : [];
      hats = local < 6 ? [2, 10] : [];
    }
    for (const hit of kicks.filter(hit => hit < cutoff)) add('kick', bar, hit, drumLevel * (hit % 4 ? .72 : 1));
    for (const hit of snares.filter(hit => hit < cutoff)) add('snare', bar, hit, drumLevel * .85);
    for (const [i, hit] of hats.filter(hit => hit < cutoff).entries()) {
      const swing = version === 'A' && hit % 2 ? .035 : 0;
      add('hat', bar, hit + swing, i % 2 ? .34 : .49, { pan: i % 2 ? .30 : -.25, open: hit === 14 && cell === 2 });
    }
    if (!intro && !eclipse && bar < 44) {
      const ghosts = version === 'A' ? (cell % 2 ? [9.5, 15] : [3.5]) : (cell === 3 ? [11] : []);
      for (const hit of ghosts.filter(hit => hit < cutoff)) add('snare', bar, hit, .22, { ghost: true });
      if (cell === 1 || cell === 2) add('perc', bar, version === 'A' ? 13.5 : 7, .38, { note: cell === 1 ? 62 : 57, pan: cell === 1 ? -.45 : .4 });
    }
    // Fills mark selected section and phrase turns. Some cadences instead stop.
    if ([11, 19, 25, 39].includes(bar)) {
      for (const [i, hit] of [13, 14.5, 15.25].entries()) add('snare', bar, hit, .22 + i * .08, { ghost: true, fill: true });
      add('perc', bar, 15.5, .44, { note: 50, pan: .35, fill: true });
    }
    if (!intro && !eclipse && bar < 47) {
      const line = version === 'A' ? [[.6, 1.7], [5.5, 2.2], [9, 1.8], [14, 1.3]]
        : [[.8, 3.0], [6, 1.8], [8.8, 3.2], [13.5, 1.7]];
      const bassNotes = ending && local >= 4 ? [[0, local === 6 ? 7 : 5.5]] : line;
      for (const [i, [at, length]] of bassNotes.entries()) if (at < cutoff) {
        const passing = cell === 3 && i === 3 && !ending ? (version === 'A' ? 2 : -2) : 0;
        add('bass', bar, at, .81 - (i % 2) * .13, { note: chord.root + passing, length: Math.min(length, 16 - at) * step });
      }
    } else if ((intro && bar === 2) || (eclipse && local === 0)) {
      add('bass', bar, 0, .55, { note: chord.root, length: 2.4 * beatSeconds });
    }
    // Pads move every two bars with voice-led extensions. Sparse high-pass
    // textures leave the bass and forward melody their own frequency ranges.
    if (bar % 2 === 0 || bar === 47) {
      const notes = chord.notes.map((note, i) => note + (version === 'B' && i > 1 ? 12 : 0));
      add('pad', bar, 0, eclipse ? .56 : intro ? .55 : .48, {
        notes, length: (bar === 47 ? 3.5 : 6.8) * beatSeconds,
        color: active ? .82 : eclipse ? .26 : .52,
      });
    }
    if (!eclipse && bar < 46) {
      const positions = version === 'A' ? [1.5, 4.5, 7, 10.5, 13, 15] : [2, 6, 10, 14];
      const selected = intro ? positions.slice(0, local + 1) : section.name === 'AURORA' ? positions.filter((_, i) => i % 2 === 0) : positions;
      const order = version === 'A' ? [0, 2, 4, 3, 1, 2] : [1, 3, 4, 2];
      for (const [i, at] of selected.entries()) if (at < cutoff) add('pluck', bar, at,
        version === 'A' ? .41 : .35, { note: chord.arp[(order[i] + (cell === 2 ? 1 : 0)) % 5],
          length: (version === 'A' ? .8 : 1.1) * beatSeconds, pan: [-.48, .23, .48, -.20][i % 4], accent: i === 0 });
    }
    if (eclipse && [0, 2].includes(local)) {
      add('pluck', bar, 5, .42, { note: local ? 73 : 74, length: 1.8 * beatSeconds, pan: local ? .4 : -.4 });
    }
    if ([3, 11, 19, 27, 31, 39].includes(bar)) add('sweep', bar, 8, .42,
      { length: 2 * beatSeconds, rising: true, accent: true });
    if ([4, 12, 20, 32, 40].includes(bar)) add('sweep', bar, 0, .28,
      { length: 1.5 * beatSeconds, rising: false });
    if ([1, 3, 4, 5, 6, 8, 9, 10].includes(phrase) && cell === 0) {
      const source = [4, 6, 9, 10].includes(phrase) ? answers[version] : themes[version];
      const aurora = section.name === 'AURORA';
      for (const [i, [at, note, length]] of source.entries()) {
        if (phrase === 1 && i > 3) continue;
        add('lead', bar + Math.floor(at / 4), (at % 4) * 4,
          aurora ? .80 : phrase === 1 ? .55 : .65, { note,
            length: length * beatSeconds * (aurora ? 1.12 : 1), pan: version === 'A' ? -.06 : .04,
            motif: `${version}-${source === themes[version] ? 'theme' : 'answer'}` });
      }
    }
  }
  // A tonic/dominant answer lands before the last bar, then the final chord
  // carries into the room decay without another drum entrance.
  for (const [offset, note, length] of version === 'A'
    ? [[0, 76, 1.2], [1.75, 73, .7], [4, 74, 3.0]] : [[0, 67, 1.3], [2, 69, 1.2], [4, 65, 3.1]]) {
    add('lead', 46 + Math.floor(offset / 4), (offset % 4) * 4, .61,
      { note, length: length * beatSeconds, pan: 0, motif: `${version}-coda` });
  }
  return events.sort((a, b) => a.at - b.at || a.voice.localeCompare(b.voice)).map((event, index) => ({ ...event, id: index }));
}

export function eventSteps(events) {
  const slots = Array.from({ length: bars * 16 }, () => []);
  for (const [index, event] of events.entries()) slots[Math.floor(event.beat * 4 + 1e-8)].push(index);
  return slots;
}
