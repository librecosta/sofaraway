import { onset, score, step, swing } from './score.mjs';

export const editions = {
  R1: { name: 'DAYBREAK-R1-No-Lead', tracks: ['backing', 'reply'] },
  R2: { name: 'DAYBREAK-R2-Groove-Only', tracks: ['backing', 'softReply'] },
  R3: { name: 'DAYBREAK-R3-Rhythmic-Accents', tracks: ['backing', 'softReply', 'accents'] },
};

export function repliesFor(frame, softened) {
  return frame.counter.map(([at, note, length, level]) => ({
    time: onset(frame.bar, at), note, length: length * step * (softened ? .70 : 1),
    level: level * .071 * (softened ? 10 ** (-7.5 / 20) : 1),
  }));
}

// Zero-based bar, sixteenth, gate in seconds, and strength. Leave OPEN and OUTRO clear.
const accents = [
  [5, 9, .105, .82], [8, 11, .094, .82], [12, 7.5, .110, .86], [15, 7.5, .108, .92],
  [17, 5.5, .103, .85], [21, 6, .108, .90], [24, 7.5, .118, .88], [27, 10.5, .095, .84],
  [30, 7, .122, .94], [34, 6.5, .119, .74], [38, 5.5, .121, .78],
  [41, 9, .105, .94], [44, 5.5, .113, .97], [46, 8.5, .106, .87], [48, 11, .111, 1],
  [50, 7.5, .107, .92], [53, 9.5, .115, .91], [56, 6.8, .108, .84],
  [59, 11, .108, .86], [61, 5.5, .109, .82], [64, 7, .121, .83], [67, 10.5, .112, .78],
];

export const accentEvents = accents.map(([bar, at, length, strength]) => {
  const { keys } = score[bar].chord;
  return { bar, at, time: onset(bar, at, swing / 2), length, strength, notes: [keys[1], ...keys.slice(-2)] };
});
