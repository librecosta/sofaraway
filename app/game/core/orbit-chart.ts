import type { Difficulty } from '../contracts';
import type { ChartGate } from './chart';
import { orbitPresets, orbitTarget } from './orbit-gates';
import type { OrbitGateKind } from './orbit-gates';
import { starwakeEvents, starwakeTrack } from './orbit-score';

const cues = starwakeEvents.filter(event => ['kick', 'snare', 'perc'].includes(event.voice)
  || event.voice === 'lead' && event.accent);
export const orbitCueBeats = [...new Set(cues.map(event => event.beat))].sort((a, b) => a - b);
const limits = { 'OUTER BELT': 7, DRIFT: 3.6, RINGBREAK: 3.1, MAELSTROM: 2.7,
  ECLIPSE: 12, AURORA: 3.0, APHELION: 3.7 } as const;
const allowed = (beat: number) => beat >= 12 && beat < 368 && !(beat >= 108 && beat < 128) && !(beat >= 147 && beat < 158);

function gate(beat: number, kind: OrbitGateKind, sector: number, axis: 0 | 1 = 0): ChartGate {
  return { beat, kind, sector, axis, section: starwakeTrack.sections.find(section => beat < section.endBeat)!.name };
}
function arrange(beats: readonly number[], offset = 0): ChartGate[] {
  let previous: [number, number] = [0, 0];
  return beats.map((beat, i) => {
    const phrase = Math.floor(beat / 16), turn = (i + offset) % 12;
    const busy = beat >= 96 && beat < 224 || beat >= 256 && beat < 352;
    let kind: OrbitGateKind = !busy || i % 4 === 0 ? 'orbit-single' : i % 3 === 0 ? 'orbit-triple' : 'orbit-dual';
    const variants = orbitPresets[kind];
    let sector = kind === 'orbit-single' ? [0, 3, 5, 1, 9, 4, 6, 2, 8, 3, 11, 7][turn] : (i + phrase + offset) % variants.length;
    // A centered reset introduces each route and receives the returning branches.
    if (beat === 128 || beat >= 158 && beat < 161 || beat >= 224 && beat < 256) { kind = 'orbit-single'; sector = 0; }
    let axis: 0 | 1 = 0;
    const a = orbitTarget(kind, sector), b = orbitTarget(kind, sector, true);
    if (Math.hypot(b[0] - previous[0], b[1] - previous[1]) < Math.hypot(a[0] - previous[0], a[1] - previous[1])) axis = 1;
    previous = axis ? b : a;
    return gate(beat, kind, sector, axis);
  });
}
const anchors: number[] = [];
for (const section of starwakeTrack.sections) {
  let previous = section.startBeat - limits[section.name];
  for (const beat of orbitCueBeats) {
    if (beat < section.startBeat || beat >= section.endBeat || !allowed(beat)) continue;
    const spacing = limits[section.name] + (Math.floor(beat / 16) % 3 === 1 ? .45 : 0);
    if (beat - previous < spacing) continue;
    if (section.name === 'ECLIPSE' && (beat < 232 || beat >= 252)) continue;
    anchors.push(beat); previous = beat;
  }
}
const base = arrange(anchors);

// Density changes must not move existing world landmarks or the shared cruise ramp.
export const orbitReferenceChart = () => base.map(g => ({ ...g }));

function originalChart(difficulty: Difficulty): ChartGate[] {
  if (difficulty === 'easy') return base.filter((g, i) => i % 3 !== 2 || g.beat >= 224 && g.beat < 256);
  if (difficulty !== 'impossible') return base.map(g => ({ ...g }));
  const out = [...base];
  for (const beat of orbitCueBeats) {
    if (!allowed(beat) || beat < 32 || beat >= 352 || beat >= 224 && beat < 256) continue;
    if (out.some(g => g.beat === beat)) continue;
    const next = out.find(g => g.beat > beat), before = out.filter(g => g.beat < beat).at(-1);
    if (!next || !before || beat - before.beat < 1.8 || next.beat - beat < 1.8) continue;
    // A large central reset keeps every incoming aperture reachable. An outer
    // choice here could strand players before the next unchanged Hard anchor.
    out.push({ ...gate(beat, 'orbit-single', [0, 7, 10][Math.floor(beat / 16) % 3]), inserted: true });
    out.sort((a, b) => a.beat - b.beat);
  }
  return out;
}

// Promote selected existing Impossible accents into the shared Normal/Hard score.
// Their original openings and every earlier anchor stay fixed; Easy stays unchanged.
const reinforcementBeats = new Set([54, 66, 75, 99, 130, 173, 213, 259, 304, 315, 331]);
const originalImpossible = originalChart('impossible');
const reinforced = [...base, ...originalImpossible.filter(g => reinforcementBeats.has(g.beat))
  .map(({ inserted, ...g }) => g)].sort((a, b) => a.beat - b.beat);

// Phrase responses selected from STARWAKE accents, with all incoming apertures
// checked at full Boost and 150 ms keyboard reaction. Multiple openings maintain
// reachable alternatives instead of making the existing holes smaller.
const impossibleResponses: ChartGate[] = [
  { ...gate(53, 'orbit-dual', 0, 1), inserted: true },
  { ...gate(61, 'orbit-dual', 0, 0), inserted: true },
  { ...gate(71, 'orbit-dual', 1, 0), inserted: true },
  { ...gate(79, 'orbit-dual', 0, 0), inserted: true },
  { ...gate(87, 'orbit-dual', 0, 0), inserted: true },
  { ...gate(93, 'orbit-dual', 3, 0), inserted: true },
  { ...gate(98, 'orbit-dual', 1, 1), inserted: true },
  { ...gate(104, 'orbit-triple', 3, 0), inserted: true },
  { ...gate(133, 'orbit-dual', 1, 0), inserted: true },
  { ...gate(141, 'orbit-dual', 4, 0), inserted: true },
  { ...gate(165, 'orbit-triple', 4, 1), inserted: true },
  { ...gate(174, 'orbit-triple', 1, 0), inserted: true },
  { ...gate(183, 'orbit-dual', 0, 0), inserted: true },
  { ...gate(191, 'orbit-dual', 1, 0), inserted: true },
  { ...gate(200, 'orbit-dual', 0, 0), inserted: true },
  { ...gate(208.75, 'orbit-dual', 5, 0), inserted: true },
  { ...gate(258, 'orbit-dual', 1, 0), inserted: true },
  { ...gate(268, 'orbit-dual', 3, 0), inserted: true },
  { ...gate(279, 'orbit-triple', 2, 0), inserted: true },
  { ...gate(288, 'orbit-triple', 1, 0), inserted: true },
  { ...gate(308, 'orbit-dual', 0, 1), inserted: true },
];

export function orbitChart(difficulty: Difficulty = 'normal'): ChartGate[] {
  if (difficulty === 'easy') return originalChart('easy');
  if (difficulty !== 'impossible') return reinforced.map(g => ({ ...g }));
  return [...originalImpossible.map(g => {
    if (!reinforcementBeats.has(g.beat)) return { ...g };
    const { inserted, ...anchor } = g;
    return anchor;
  }), ...impossibleResponses.map(g => ({ ...g }))].sort((a, b) => a.beat - b.beat);
}

export function orbitRouteCharts(main: readonly ChartGate[], difficulty: Difficulty = 'normal') {
  const choose = (targets: readonly number[]) => targets.map(target => orbitCueBeats.find(beat => beat >= target && beat < target + 1)!)
    .filter(beat => beat !== undefined && beat < 147);
  const challenge = arrange(choose(difficulty === 'impossible' ? [128, 130, 132, 134, 136, 138, 140, 142, 144, 146]
    : [128, 131, 134, 137, 140, 143, 146]), 3);
  // One broad response strengthens Main/Challenge while Bonus retains its four rewards.
  if (difficulty !== 'easy') {
    challenge.push(difficulty === 'impossible' ? gate(145, 'orbit-single', 0) : gate(132, 'orbit-dual', 0));
    challenge.sort((a, b) => a.beat - b.beat);
  }
  const score = choose([130, 134, 138, 142]).map((beat, i) => gate(beat, i === 2 ? 'orbit-triple' : 'orbit-single', 0));
  return { main: main.map(g => ({ ...g })), challenge, score };
}
