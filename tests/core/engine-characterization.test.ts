import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import type { Difficulty, PlayMode } from '../../app/game/contracts';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import type { RouteKind } from '../../app/game/core/branches';
import { buildChart, chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { ShowcasePilot } from '../../app/game/core/showcase-pilot';
import { Simulation } from '../../app/game/core/simulation';
import type { RunGate } from '../../app/game/core/simulation';
import { VOLUMES } from '../../app/game/core/volumes';

const difficulties = ['easy', 'normal', 'hard', 'impossible'] as const;
const seeds = [0, 1] as const;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const round = (value: number) => Math.round(value * 1e6) / 1e6;
type GateRowSource = Pick<RunGate, 'kind' | 'axis' | 'open' | 'worldStation' | 'routeStation'>
  & Partial<Pick<RunGate, 'beat' | 'inserted'>>;
const gateRow = (gate: GateRowSource) => [
  gate.kind, gate.beat, gate.axis, gate.open, gate.inserted ?? false, round(gate.worldStation), round(gate.routeStation),
];

// Frozen at cf127bf using the serialization in the F4-A audit.
const baseline = {
  elsewhere: {
    counts: [143, 144, 144, 184],
    authored: '0ce6af001eeca5bfa5d1c4fed8033de85dd789b15c8716ccb8daefaa6aea96dd',
    spatial: '3dba3a376831cc7121c3cc57f3041bb3fea2d020246962e2a3c916727209773f',
  },
  daybreak: {
    counts: [120, 120, 120, 147],
    authored: '8f957421a7536391d9ce978d7a4f44d7de336ddbad15a8d266aaa7d2e4871ef3',
    spatial: '0d18191e9fb40a6d0d0bdb8acf7ab416be8bfb4e1681a93d0c14639632cb043d',
  },
  descent: {
    counts: [161, 161, 161, 189],
    authored: '91b42c1f759be968470fdc2f3e8913e314884a887eb1cfcdcd21dbdb14c318d7',
    spatial: '258bc84f825057dac084b9a79c0b5eb6278a47ff306b974f8c8842486c5066e1',
  },
  orbit: {
    counts: [92, 92, 92, 135],
    authored: 'b109cc72fb719ad500dec603e93f38f834bd735e334e2b2d22b13a067f26dbd2',
    spatial: 'f3c73e6f17c7288c3e53999f8a736ea7eacd3ab045c23700f8e7d13d43bd122e',
  },
};

test.each(VOLUMES)('$id preserves authored and spatial fingerprints', volume => {
  const authored = difficulties.map(difficulty => chartFor(volume, difficulty).map(gate =>
    [gate.beat, gate.kind, gate.sector, gate.axis ?? null, gate.section, Boolean(gate.inserted)]));
  const spatial = [];
  for (const mode of ['standard', 'sightseeing'] as const) {
    for (const difficulty of mode === 'standard' ? difficulties : ['normal'] as const) {
      for (const seed of seeds) {
        const sim = new Simulation(volume, {}, undefined, mode, difficulty);
        sim.start(difficulty, seed, undefined, mode);
        const branch = sim.gameplay.branch!;
        const path = sim.junctionPath!;
        spatial.push([volume.id, mode, difficulty, seed, branchLayout(seed),
          [branch.preview, branch.split, branch.open, branch.merge, branch.rejoin],
          [path.guideStart, path.split, path.end].map(round), sim.mainGates.map(gateRow),
          Object.entries(sim.branchGates!).map(([route, gates]) => [route, gates.map(gateRow)]),
          sim.outroPlan!.gates.map(gateRow), round(sim.outroPlan!.afterglowStart),
          round(sim.pickupStation), round(sim.pickupPreviewStation),
          Array.from({ length: Math.ceil(volume.beats) + 1 }, (_, beat) =>
            round(sim.reference.station(Math.min(beat, volume.beats), mode)))]);
      }
    }
  }
  expect(authored.map(chart => chart.length)).toEqual(baseline[volume.id].counts);
  expect(digest(authored)).toBe(baseline[volume.id].authored);
  expect(digest(spatial)).toBe(baseline[volume.id].spatial);
});

test.each(VOLUMES)('$id selects authored charts independently of music', volume => {
  const otherScore = { ...volume, music: volume.music === 'techno' ? 'starwake' as const : 'techno' as const };
  expect(buildChart(otherScore)).toEqual(buildChart(volume));
  for (const difficulty of difficulties) expect(chartFor(otherScore, difficulty)).toEqual(chartFor(volume, difficulty));
});

const flights = [
  { name: 'main', difficulty: 'normal', mode: 'standard', route: 'main', align: true },
  { name: 'challenge boost', difficulty: 'impossible', mode: 'standard', route: 'challenge', align: true, boost: true },
  { name: 'sightseeing bonus', difficulty: 'normal', mode: 'sightseeing', route: 'score', align: true },
  { name: 'showcase bonus', difficulty: 'impossible', mode: 'standard', showcase: true },
  { name: 'collision', difficulty: 'impossible', mode: 'standard' },
] as const satisfies readonly {
  name: string; difficulty: Difficulty; mode: PlayMode; route?: RouteKind;
  align?: boolean; boost?: boolean; showcase?: boolean;
}[];

test('four volumes preserve fixed-step crossings, branch selection and endings', () => {
  const traces = Object.fromEntries(VOLUMES.map(volume => [volume.id,
    flights.map(flight => {
      const seed = 0;
      const layout = branchLayout(seed);
      const side = 'route' in flight ? routeSides.find(candidate => layout[candidate] === flight.route) : undefined;
      const sim = new Simulation(volume, { align: 'align' in flight, branchSide: side });
      const showcase = 'showcase' in flight;
      sim.start(flight.difficulty, seed, 'lumen', flight.mode, !showcase);
      const pilot = showcase ? new ShowcasePilot(sim, 'score') : undefined;
      const input = 'boost' in flight ? { ...idleInput, boosting: true } : idleInput;
      const path = sim.junctionPath!;
      const checkpoints = [path.split, sim.reference.station(path.spec.merge[flight.mode], flight.mode), path.end];
      const events = [];
      let phase = '', checkpoint = 0, lastJudged = 0, lastEncore = 0;
      for (let tick = 1; sim.phase !== 'results'; tick++) {
        if (tick > (sim.secondsPerBeat * volume.beats + 10) / STEP) throw new Error(`No results for ${volume.id}/${flight.name}`);
        const decision = pilot && sim.phase === 'playing' ? pilot.input(sim) : input;
        sim.step(STEP, decision);
        const mark = `${sim.phase}/${sim.outroPhase}/${sim.route}`;
        if (mark !== phase) {
          events.push([tick, mark, sim.branch?.side, round(sim.score), sim.lives]);
          if (phase && !phase.endsWith(`/${sim.route}`)) events.push(sim.mainGates.slice(sim.gatesJudged).map(gateRow));
          phase = mark;
        }
        while (checkpoint < checkpoints.length && sim.trackDistance >= checkpoints[checkpoint]) {
          events.push([tick, 'junction', checkpoint++, round(sim.distance), round(sim.trackDistance)]);
        }
        if (sim.gatesJudged !== lastJudged) {
          events.push([tick, sim.mainGates.slice(lastJudged, sim.gatesJudged)
            .map(gate => [gateRow(gate), gate.hit, round(gate.crossedAt!)]), round(sim.score), sim.lives]);
          lastJudged = sim.gatesJudged;
        }
        const encore = (sim.encore?.passed ?? 0) + (sim.encore?.missed ?? 0);
        if (encore !== lastEncore) {
          events.push([tick, 'encore', sim.encore]);
          lastEncore = encore;
        }
        if (pilot && tick % 60 === 0) events.push([tick, decision.target?.map(round), round(sim.camera.x), round(sim.camera.y), round(sim.distance)]);
      }
      return [flight.name, sim.result?.title, sim.result?.route, digest([events, sim.result, sim.hits, sim.lives, round(sim.score)])];
    }),
  ]));
  expect(traces).toMatchSnapshot();
});
