import type { Difficulty } from '../contracts';
import type { ChartGate } from './chart';
import type { Axis } from './collision';
import type { DescentGateKind } from './descent-gates';
import { controlTrack } from './descent-score';

type Opening = readonly [kind: DescentGateKind, sector: number, axis: Axis];
type Phrase = readonly [beats: readonly number[], openings: readonly Opening[]];
type Chapter = typeof controlTrack.sections[number]['name'];

const matrix = (sector: number): Opening => ['laser-matrix', sector, 0];
const vertical = (side: -1 | 0 | 1): Opening => ['laser-slice', side === -1 ? 4 : side === 1 ? 0 : 2, 0];
const horizontal = (side: -1 | 0 | 1): Opening => ['laser-slice', side === -1 ? 6 : side === 1 ? 2 : 0, 1];
const weave = (axis: Axis, sector: number): Opening => ['laser-weave', sector, axis];

// Four-bar gestures on CONTROL kick, snare and fill onsets. The openings
// describe a sweep, answer or reset across each phrase.
const phrases: Record<Chapter, readonly Phrase[]> = {
  ORDER: [
    [[6, 10, 14], [matrix(0), matrix(1), matrix(2)]],
    [[2, 4, 8, 11, 14], [matrix(3), matrix(4), vertical(-1), matrix(5), matrix(6)]],
  ],
  LOCK: [
    [[1, 3, 5, 8, 10, 12, 14], [matrix(7), matrix(0), matrix(1), matrix(2), matrix(3), vertical(-1), matrix(4)]],
    [[0, 2, 4, 7, 9, 11, 14], [matrix(5), matrix(6), matrix(7), matrix(0), vertical(1), matrix(1), matrix(2)]],
    [[1, 3, 5, 7, 10, 12, 14], [matrix(3), matrix(4), vertical(-1), matrix(5), matrix(6), matrix(7), horizontal(-1)]],
    [[0, 2, 5, 7, 9, 11, 14.5], [matrix(7), matrix(0), matrix(1), horizontal(1), matrix(2), matrix(3), matrix(4)]],
  ],
  FLIGHT: [
    [[0, 2, 4, 5.75, 7.75, 9, 11, 13, 15],
      [vertical(-1), vertical(0), matrix(2), horizontal(1), vertical(0), vertical(1), matrix(0), vertical(0), horizontal(0)]],
    [[1, 3, 5, 7, 8.75, 10.75, 13, 14.5],
      [horizontal(-1), matrix(6), horizontal(-1), vertical(0), horizontal(0), horizontal(1), matrix(2), vertical(0)]],
    // Let the centered shutter at 126.5 close the approach phrase. The next
    // shutters belong to the individual tracks, after the turnout opens.
    [[], []],
    [[1, 3, 5, 7, 9, 11, 13, 14.75],
      [vertical(0), vertical(0), horizontal(0), horizontal(1), matrix(2), vertical(0), horizontal(0), vertical(1)]],
    // Leave the merge clear. A centered shutter welcomes all three tracks back.
    [[9, 10.75, 13, 15], [horizontal(0), matrix(6), horizontal(-1), vertical(0)]],
  ],
  PRESSURE: [
    [[1, 2.5, 4, 5.5, 7.75, 9, 11, 14],
      [weave(0, 1), matrix(2), horizontal(1), weave(0, 2), matrix(3), vertical(-1), weave(1, 3), horizontal(0)]],
    [[0, 1.75, 4, 6, 8, 9.5, 12, 14],
      [weave(1, 5), matrix(5), horizontal(-1), weave(0, 5), matrix(7), vertical(1), weave(1, 1), horizontal(0)]],
    [[0, 1.5, 3.75, 5, 6.75, 9, 11, 14],
      [weave(1, 3), matrix(1), vertical(1), weave(0, 0), matrix(7), horizontal(-1), weave(1, 7), vertical(0)]],
    [[0, 2, 4, 5.5, 7.75, 9, 11, 14],
      [weave(0, 2), matrix(3), vertical(-1), weave(1, 4), matrix(5), horizontal(-1), weave(0, 5), vertical(0)]],
    [[0, 2, 4, 6, 8, 9.5, 11.75, 14],
      [weave(1, 5), matrix(6), horizontal(-1), weave(1, 7), vertical(0), matrix(2), weave(0, 2), horizontal(1)]],
  ],
  HOLD: [
    [[8], [weave(0, 1)]],
    [[0, 8, 12, 14], [horizontal(0), weave(1, 3), vertical(0), horizontal(0)]],
  ],
  LOCKDOWN: [
    [[0, 1.75, 3, 4.75, 6, 7.75, 9, 10.75, 12, 14.5],
      [matrix(0), vertical(1), matrix(1), weave(0, 1), matrix(2), weave(0, 2), matrix(3), horizontal(1), vertical(-1), matrix(4)]],
    [[0, 2, 3.75, 5, 6.5, 8, 9.75, 11, 13, 14.75],
      [matrix(4), vertical(-1), matrix(5), weave(0, 5), matrix(6), horizontal(-1), matrix(7), weave(1, 7), vertical(1), matrix(0)]],
    [[0, 1.75, 3, 4.75, 6, 7.75, 9, 10.75, 12, 14.75],
      [vertical(1), matrix(1), horizontal(1), weave(1, 1), matrix(2), weave(0, 2), matrix(3), vertical(-1), matrix(4), weave(0, 4)]],
    [[0, 1.25, 2.5, 4, 6, 7.75, 9, 10.75, 12, 14.5],
      [matrix(4), vertical(-1), matrix(5), weave(1, 5), horizontal(-1), matrix(6), weave(0, 6), matrix(7), vertical(1), matrix(0)]],
  ],
  BREACH: [
    [[0, 2, 4, 6, 8, 10, 12, 14],
      [vertical(1), weave(0, 1), matrix(2), horizontal(1), weave(1, 3), vertical(0), matrix(6), horizontal(-1)]],
    [[0, 2, 4], [weave(1, 7), vertical(0), horizontal(0)]],
  ],
};

type Accent = readonly [beat: number, opening: Opening];

function accents(section: Chapter, entries: readonly Accent[]): ChartGate[] {
  return entries.map(([beat, [kind, sector, axis]]) => ({ beat, kind, sector, axis, section, inserted: true }));
}

const anchors = controlTrack.sections.flatMap(section => phrases[section.name].flatMap(([beats, openings], phrase) =>
  beats.map((offset, i) => {
    const [kind, sector, axis] = openings[i];
    return { beat: section.startBeat + phrase * 16 + offset, section: section.name, kind, sector, axis };
  })));

// CONTROL kick, snare and fill onsets. Slices leave room to set up the next
// opening, while Matrix and Weave answer the direction of the existing phrase.
const impossibleMain = [
  ...anchors,
  ...accents('LOCK', [
    [38, vertical(1)], [53.75, vertical(1)], [63.25, horizontal(1)],
    [72, vertical(-1)], [84, horizontal(1)], [93, vertical(-1)],
  ]),
  ...accents('FLIGHT', [
    [97, weave(0, 4)], [103, weave(1, 0)], [108, weave(0, 0)],
    [112, vertical(0)], [118, matrix(6)], [123.75, vertical(0)],
    // Two replies inside Main, clear of the turnout and merge.
    [146, horizontal(0)], [158, matrix(0)],
  ]),
  ...accents('PRESSURE', [
    [183, weave(0, 4)], [189, vertical(0)], [202.75, matrix(0)], [221, horizontal(0)],
    [231, horizontal(-1)], [237, horizontal(0)], [250.75, vertical(0)],
  ]),
  ...accents('LOCKDOWN', [
    [289, horizontal(1)], [301, matrix(3)], [318, horizontal(0)], [326.75, weave(0, 4)],
    [333, vertical(-1)], [341, matrix(4)], [349, matrix(7)],
  ]),
].sort((a, b) => a.beat - b.beat);

const challengeAccents = accents('FLIGHT', [[146, weave(1, 0)], [154, matrix(4)], [158, weave(0, 1)]]);

export function descentChart(difficulty: Difficulty = 'normal'): ChartGate[] {
  return (difficulty === 'impossible' ? impossibleMain : anchors).map(gate => ({ ...gate }));
}

export function descentChallengeChart(anchors: ChartGate[], difficulty: Difficulty): ChartGate[] {
  return difficulty === 'impossible'
    ? [...anchors, ...challengeAccents.map(gate => ({ ...gate }))].sort((a, b) => a.beat - b.beat)
    : anchors;
}
