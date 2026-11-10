/* ------------------------------------------------------------------ *
 *  Chart — the score.
 *
 *  One run is one song. Gates sit on absolute beats so they always land
 *  on the music no matter how fast the corridor scrolls. Each gate names
 *  the sector that is *missing* from the bulkhead.
 *
 *  Sector index, counter-clockwise from east:
 *      0 E   1 NE   2 N   3 NW   4 W   5 SW   6 S   7 SE
 * ------------------------------------------------------------------ */

export const SONG_BEATS = 448;          // 3:30 at 128 BPM
export const BPM = 128;

/* energy decides the arrangement in audio.js and the density here */
export const SECTIONS = [
  { name: 'INTRO',  beats: 16, gap: 999, pattern: 'sweep',    energy: 0.15 },
  { name: 'A',      beats: 80, gap: 4.0, pattern: 'step',     energy: 0.45 },
  { name: 'B',      beats: 64, gap: 4.0, pattern: 'opposite', energy: 0.55 },
  { name: 'BUILD',  beats: 32, gap: 3.0, pattern: 'zigzag',   energy: 0.75 },
  { name: 'DROP',   beats: 96, gap: 2.33, pattern: 'leap',     energy: 1.00 },
  { name: 'BREAK',  beats: 32, gap: 5.33, pattern: 'sweep',    energy: 0.30 },
  { name: 'A2',     beats: 64, gap: 3.0, pattern: 'step',     energy: 0.65 },
  { name: 'FINALE', beats: 64, gap: 2.33, pattern: 'leap',     energy: 1.00 },
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (s) => ((s % 8) + 8) % 8;

function nextSector(pattern, prev, i, rng) {
  switch (pattern) {
    case 'sweep':
      return wrap(prev + 1);
    case 'step':
      return wrap(prev + (rng() < 0.5 ? 1 : -1));
    case 'opposite':
      return wrap(prev + 4);
    case 'zigzag':
      return wrap(prev + (i % 2 === 0 ? 3 : -3));
    case 'leap': {
      // mostly one or two steps, occasionally a big lateral cut
      const r = rng();
      if (r < 0.30) return wrap(prev + 1);
      if (r < 0.58) return wrap(prev - 1);
      if (r < 0.80) return wrap(prev + 2);
      if (r < 0.92) return wrap(prev - 2);
      return wrap(prev + 4);
    }
    default:
      return wrap(prev + 1);
  }
}

/** the authored chart, deterministic for a given seed */
export function buildChart(seed = 20131) {
  const rng = mulberry32(seed);
  const out = [];
  let beat = 8;
  let prev = 2;          // start up

  for (const sec of SECTIONS) {
    const end = beat + sec.beats;
    let b = beat;
    let i = 0;
    if (sec.gap >= 900) { beat = end; continue; }   // gate-free section
    while (b < end - 0.75) {
      const sector = nextSector(sec.pattern, prev, i, rng);
      out.push({ beat: Math.round(b * 100) / 100, sector, section: sec.name });
      prev = sector;
      b += sec.gap;
      i++;
    }
    beat = end;
  }
  return out;
}

/** difficulty trims the chart; hard and normal play the authored one */
export function chartFor(difficulty, seed = 20131) {
  const base = buildChart(seed);
  if (difficulty !== 'easy') return base;

  const out = [];
  let last = -99;
  for (const g of base) {
    if (g.beat - last >= 2) {
      out.push(g);
      last = g.beat;
    }
  }
  return out;
}

export const DIFFICULTY = {
  easy:   { label: 'EASY',   lives: 3, mult: 1.0, seed: 20131 },
  normal: { label: 'NORMAL', lives: 2, mult: 1.6, seed: 77345 },
  hard:   { label: 'HARD',   lives: 1, mult: 2.4, seed: 44129 },
};
