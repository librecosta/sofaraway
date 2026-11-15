import type { ChartGate } from './chart';
import type { RouteKind } from './branches';
import { STEP } from './clock';
import { canPass, clamp, lanePoint } from './collision';
import { crystalOpenings } from './daybreak-gates';
import { bpm, duration, rhythmTimeline, sections } from './daybreak-score';
import { idleInput, steer, STEERING_SPEED, steeringDamping } from './input';
import { BOOST_MULTIPLIER, cruiseTarget, referenceMotion } from './reference-motion';

const crystal = 'daybreak-crystal';
const vertical = 'daybreak-vertical';
const horizontal = 'daybreak-horizontal';
const hits = rhythmTimeline().filter(event => event.kind === 'kick' || event.kind === 'snare' || event.kind === 'fill' || event.kind === 'hat');
type Onset = typeof hits[number];
const fullBoost = cruiseTarget(Infinity) * BOOST_MULTIPLIER;
const steerDamping = steeringDamping(STEP);
const steerStep = STEERING_SPEED * STEP;

/** Match evenly distributed phrase slots to real onsets while preserving travel time. */
function phrase(section: string, start: number, end: number, count: number,
  shape: RouteKind = 'main'): Onset[] {
  const gap = shape === 'score' ? .66 : shape === 'challenge' ? 1.14 : 1.26;
  const candidates = hits.filter(hit => hit.section === section && hit.beat >= start && hit.beat <= end
    && (hit.kind !== 'hat' || shape === 'score'));
  let predecessor = -1;
  const before = candidates.map(hit => {
    while (candidates[predecessor + 1]?.beat <= hit.beat - gap) predecessor++;
    return predecessor;
  });
  const choices = Array.from({ length: count }, () => new Int32Array(candidates.length));
  let costs = new Float64Array(candidates.length);
  for (const [index, choice] of choices.entries()) {
    const target = start + (end - start) * (index + .32) / count;
    const best = new Float64Array(candidates.length);
    candidates.forEach((hit, i) => {
      const cost = (index ? costs[before[i]] ?? Infinity : 0) + Math.abs(hit.beat - target)
        + (hit.kind === 'snare' ? .10 : hit.kind === 'fill' ? .16 : hit.kind === 'hat' ? .27 : 0);
      const earlier = best[i - 1] ?? Infinity;
      choice[i] = cost < earlier ? i : choice[i - 1] ?? -1;
      best[i] = Math.min(cost, earlier);
    });
    costs = best;
  }
  if (!Number.isFinite(costs.at(-1))) throw new Error(`DAYBREAK ${section} cannot fit ${count} gates between beats ${start} and ${end}`);
  let last = candidates.length - 1;
  return choices.map((_, index) => {
    const hit = choices[count - index - 1][last];
    last = before[hit];
    return candidates[hit];
  }).reverse();
}

export const daybreakJunctionWindow = { preview: 224, split: 228, open: 232, merge: 256, rejoin: 259 } as const;
export const DAYBREAK_PICKUP_BEAT = 152;

const mainPhrases = [
  { onsets: phrase('GLIDE', 17, 77, 28), origin: 0, sweep: 1 },
  { onsets: phrase('LIFT', 81, 125, 22), origin: 2, sweep: 1 },
  { onsets: phrase('BREEZE', 130, 150, 4), origin: 3, sweep: -1 },
  { onsets: phrase('BREEZE', 154, 158.9, 3), origin: 1, sweep: 1 },
  { onsets: phrase('SUNBURST', 160, 222, 38), origin: 7, sweep: 1 },
  { onsets: phrase('RETURN', 224, 227, 2), origin: 0, sweep: 1 },
  { onsets: phrase('RETURN', 232.3, 255.8, 15), origin: 6, sweep: -1 },
  { onsets: phrase('RETURN', 259, 271.95, 8), origin: 4, sweep: -1 },
];
const station = referenceMotion(duration * bpm / 60, 60 / bpm, mainPhrases.flatMap(({ onsets }) => onsets));
const centerGate = (hit: Onset): ChartGate => ({ beat: hit.beat, section: hit.section,
  kind: hit.kind === 'snare' || (hit.kind === 'hat' && hit.bar % 2 === 0) ? horizontal : vertical, sector: 0 });
const wrap = (sector: number) => (sector + crystalOpenings.length) % crystalOpenings.length;

/** Main distance is a lower bound on either side route, at the full Boost speed cap. */
function canSteer(from: ChartGate, to: ChartGate) {
  const seconds = (station(to.beat) - station(from.beat)) / fullBoost - .15;
  let [x, y] = lanePoint(from.kind, from.sector, 0), tx = x, ty = y;
  const [aimX, aimY] = lanePoint(to.kind, to.sector, 0);
  const frames = Math.floor(seconds / STEP);
  for (let frame = 0; frame < frames; frame++) {
    [tx, ty] = steer({ ...idleInput, axisX: clamp((aimX - tx) / steerStep, -1, 1),
      axisY: clamp((aimY - ty) / steerStep, -1, 1) }, tx, ty, STEP);
    x += (tx - x) * steerDamping;
    y += (ty - y) * steerDamping;
  }
  return [-.13, .13].every(dx => [-.13, .13].every(dy => canPass(to.kind, to.sector, 0, x + dx, y + dy)));
}

function choreograph(onsets: readonly Onset[], origin: number, sweep: number) {
  const section = sections.find(section => section.name === onsets[0].section)!;
  const gates: ChartGate[] = [];
  let sector = origin;
  let previousPhrase = -1;
  for (const [index, hit] of onsets.entries()) {
    const center = centerGate(hit);
    const previous = gates.at(-1);
    const next = onsets[index + 1];
    const phraseIndex = Math.floor((hit.bar - section.startBar) / 2);
    const response = phraseIndex % 2 === 0 ? sweep : -sweep;
    const newPhrase = phraseIndex !== previousPhrase;
    // Start each phrase from the cabin center. Snare answers reverse the contour, and fills can take a larger step.
    const rest = !previous || !next || (hit.section === 'BREEZE' && index % 2 === 0)
      || (newPhrase && (hit.section === 'SUNBURST' || hit.kind !== 'fill'));
    const step = hit.kind === 'fill' ? 2 * response : hit.kind === 'snare' && hit.section !== 'BREEZE' ? -response : response;
    const choices = [sector + step, sector + response, sector - response].map(wrap);
    const chosen = rest ? undefined : choices.map(sector => ({ ...center, kind: crystal, sector } as ChartGate))
      .find(gate => canSteer(previous, gate) && canSteer(gate, centerGate(next)));
    gates.push(chosen ?? center);
    if (chosen) sector = chosen.sector;
    if (newPhrase && hit.section === 'SUNBURST') sector = wrap(origin + phraseIndex * 2);
    previousPhrase = phraseIndex;
  }
  return gates;
}

const main = mainPhrases.flatMap(({ onsets, origin, sweep }) => choreograph(onsets, origin, sweep));

export function daybreakChart() { return main.map(gate => ({ ...gate })); }

const challenge = choreograph(phrase('RETURN', 232.1, 255.99, 16, 'challenge'), 1, 1);
const bonus = phrase('RETURN', 232.2, 255.8, 26, 'score').map(centerGate);

export function daybreakRouteCharts(replaced: readonly ChartGate[]): Record<RouteKind, ChartGate[]> {
  return { main: [...replaced], challenge: [...challenge], score: [...bonus] };
}
