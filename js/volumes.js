/* ------------------------------------------------------------------ *
 *  Volumes — one record per map.
 *
 *  Everything a run needs hangs off these: tempo, length, the section
 *  table that both the chart and the arrangement read, the corridor
 *  topology, the kind of glass you are threading, and the palette.
 * ------------------------------------------------------------------ */

/* section = { name, beats, gap, pattern, energy } */

const SECTIONS_I = [
  { name: 'INTRO',  beats: 16, gap: 999,  pattern: 'sweep',    energy: 0.15 },
  { name: 'A',      beats: 80, gap: 4.0,  pattern: 'step',     energy: 0.45 },
  { name: 'B',      beats: 64, gap: 4.0,  pattern: 'opposite', energy: 0.55 },
  { name: 'BUILD',  beats: 32, gap: 3.0,  pattern: 'zigzag',   energy: 0.75 },
  { name: 'DROP',   beats: 96, gap: 2.33, pattern: 'leap',     energy: 1.00 },
  { name: 'BREAK',  beats: 32, gap: 5.33, pattern: 'sweep',    energy: 0.30 },
  { name: 'A2',     beats: 64, gap: 3.0,  pattern: 'step',     energy: 0.65 },
  { name: 'FINALE', beats: 64, gap: 2.33, pattern: 'leap',     energy: 1.00 },
];

/* downtempo: fewer, wider gates; the turn is the event, not the gap */
const SECTIONS_II = [
  { name: 'OPEN',   beats: 16, gap: 999,  pattern: 'sweep',    energy: 0.10 },
  { name: 'DRIFT',  beats: 64, gap: 6.0,  pattern: 'step',     energy: 0.35 },
  { name: 'SWELL',  beats: 48, gap: 5.0,  pattern: 'opposite', energy: 0.55 },
  { name: 'LULL',   beats: 32, gap: 8.0,  pattern: 'sweep',    energy: 0.20 },
  { name: 'RISE',   beats: 48, gap: 4.0,  pattern: 'zigzag',   energy: 0.70 },
  { name: 'OUT',    beats: 16, gap: 6.0,  pattern: 'sweep',    energy: 0.25 },
];

const SECTIONS_III = [
  { name: 'MOUTH',  beats: 16, gap: 999,  pattern: 'sweep',    energy: 0.15 },
  { name: 'FALL',   beats: 96, gap: 3.0,  pattern: 'step',     energy: 0.55 },
  { name: 'PRESS',  beats: 96, gap: 2.0,  pattern: 'leap',     energy: 0.85 },
  { name: 'HOLD',   beats: 32, gap: 4.0,  pattern: 'sweep',    energy: 0.35 },
  { name: 'SHEAR',  beats: 96, gap: 2.0,  pattern: 'leap',     energy: 1.00 },
  { name: 'BOTTOM', beats: 64, gap: 3.0,  pattern: 'opposite', energy: 0.90 },
];

const SECTIONS_IV = [
  { name: 'LAUNCH', beats: 16, gap: 999,  pattern: 'sweep',    energy: 0.15 },
  { name: 'ORBIT',  beats: 80, gap: 4.0,  pattern: 'sweep',    energy: 0.45 },
  { name: 'WIDE',   beats: 80, gap: 3.5,  pattern: 'opposite', energy: 0.60 },
  { name: 'FLARE',  beats: 80, gap: 2.5,  pattern: 'leap',     energy: 0.85 },
  { name: 'HOME',   beats: 64, gap: 4.0,  pattern: 'step',     energy: 0.50 },
];

function total(sections) {
  return sections.reduce((n, s) => n + s.beats, 0);
}

export const VOLUMES = [
  {
    id: 'elsewhere',
    name: 'ELSEWHERE',
    subtitle: 'VOL. I',
    bpm: 128,
    sections: SECTIONS_I,
    beats: total(SECTIONS_I),
    seed: 20131,
    topology: 'conduit',
    obstacle: 'iris',
    music: 'techno',
    hue: [0.44, 0.78, 0.92, 0.57, 0.09, 0.66],
    lives: { easy: 3, normal: 2, hard: 1 },
    ready: true,
  },
  {
    id: 'drift',
    name: 'DRIFT',
    subtitle: 'VOL. II',
    bpm: 96,
    sections: SECTIONS_II,
    beats: total(SECTIONS_II),
    seed: 88121,
    topology: 'canal',          // floor and two low walls, sky above and a glazed side
    obstacle: 'shutter',        // horizontal slats, one band open
    music: 'downtempo',
    hue: [0.52, 0.60, 0.47, 0.68],
    lives: { easy: 4, normal: 3, hard: 2 },
    ready: true,
  },
  {
    id: 'descent',
    name: 'DESCENT',
    subtitle: 'VOL. III',
    bpm: 110,
    sections: SECTIONS_III,
    beats: total(SECTIONS_III),
    seed: 44129,
    topology: 'shaft',          // vertical drop, ring section
    obstacle: 'lattice',        // 3x3 plates, one missing
    music: 'industrial',
    hue: [0.03, 0.98, 0.09],
    lives: { easy: 3, normal: 2, hard: 1 },
    ready: true,
  },
  {
    id: 'orbit',
    name: 'ORBIT',
    subtitle: 'VOL. IV',
    bpm: 100,
    sections: SECTIONS_IV,
    beats: total(SECTIONS_IV),
    seed: 77345,
    topology: 'orbit',          // no corridor at all: free-standing rings in the void
    obstacle: 'aperture',       // one off-centre round hole in a full pane
    music: 'synthwave',
    hue: [0.62, 0.70, 0.55],
    lives: { easy: 3, normal: 2, hard: 1 },
    ready: true,
  },
];

const wanted = typeof location !== 'undefined'
  ? new URLSearchParams(location.search).get('vol')
  : null;

export const VOL = VOLUMES.find((v) => v.id === wanted && v.ready) || VOLUMES[0];

export function volumeById(id) {
  return VOLUMES.find((v) => v.id === id) || VOLUMES[0];
}

export function sectionAt(beat) {
  let start = 0;
  for (const [i, section] of VOL.sections.entries()) {
    const end = start + section.beats;
    if (beat < end) return { ...section, i, start, end, next: VOL.sections[i + 1] };
    start = end;
  }
  return null;
}
