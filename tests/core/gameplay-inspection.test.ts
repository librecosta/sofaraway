import { describe, expect, it } from 'vitest';
import { difficulties } from '../../app/game/contracts';
import { branchLayout } from '../../app/game/core/branches';
import { chartFor, difficultySettings } from '../../app/game/core/chart';
import { gameplayFor } from '../../app/game/core/gameplay';
import { pickupForSeed } from '../../app/game/core/pickups';
import { referenceFor } from '../../app/game/core/reference-track';
import { VOLUMES } from '../../app/game/core/volumes';
import { gateOpeningAt } from '../../app/game/debug/catalog';
import { inspectGameplay } from '../../app/game/debug/gameplay-inspection';

describe('Explorer gameplay inspection', () => {
  for (const volume of VOLUMES) it(`reads the production chart, branch replacements and pickup in ${volume.name}`, () => {
    const { branch, pickup } = gameplayFor(volume.id);
    for (const difficulty of [...difficulties, 'impossible'] as const) {
      const chart = chartFor(volume, difficulty);
      const inBranch = ({ beat }: { beat: number }) => beat >= branch!.split && beat < branch!.rejoin;
      const replacement = branch!.charts(chart.filter(inBranch), difficulty);
      const reference = referenceFor(volume, difficulty);
      for (const seed of [0, 1]) {
        const data = inspectGameplay(volume.id, difficulty, seed);
        expect(data.authored).toEqual(chart);
        expect(data.rules).toEqual(difficultySettings(volume, difficulty));
        expect(data.layout).toEqual(branchLayout(seed));
        expect(data.pickup).toEqual({ ...pickup, kind: pickupForSeed(seed), station: reference.station(pickup!.beat, 'standard') });
        expect(data.sections.reduce((total, chapter) => total + chapter.authored, 0)).toBe(chart.length);
        for (const route of ['main', 'challenge', 'score'] as const) {
          const selected = data.gatesFor(route);
          const beats = [...chart.filter(gate => !inBranch(gate)), ...replacement[route]].map(gate => gate.beat).sort((a, b) => a - b);
          expect(data.layout[selected.side]).toBe(route);
          expect(selected.gates.map(gate => gate.beat)).toEqual(beats);
          expect(selected.gates.every(gate => gate.worldStation === reference.station(gate.beat, 'standard') &&
            gateOpeningAt(gate.kind, gate.open, gate.axis) !== undefined)).toBe(true);
        }
        expect(data.plan!.gates.every(gate => gate.worldStation >= data.plan!.transitionEnd &&
          gateOpeningAt(gate.kind, gate.open, gate.axis) !== undefined)).toBe(true);
      }
    }
  });
});
