import type { Difficulty, VolumeId } from '../contracts';
import { branchLayout, routeSides } from '../core/branches';
import type { RouteKind } from '../core/branches';
import { chartFor, difficultySettings } from '../core/chart';
import { ELSEWHERE_ESCAPE_BEATS, gameplayFor } from '../core/gameplay';
import { Simulation } from '../core/simulation';
import { sectionAt, volumeById } from '../core/volumes';

export function inspectGameplay(id: VolumeId, difficulty: Difficulty, seed: number) {
  const volume = volumeById(id);
  const rules = difficultySettings(volume, difficulty);
  const authored = chartFor(volume, difficulty, rules.seed);
  const { branch, ending, pickup } = gameplayFor(id);
  const simulation = new Simulation(volume);
  // Build the same run data as gameplay. This preview owns no runtime and never ticks.
  simulation.start(difficulty, seed, undefined, 'standard', false);
  const layout = branchLayout(seed);
  let beat = 0;
  const sections = volume.sections.map(({ name, beats }) => {
    const start = beat;
    beat += beats;
    return { name, start, end: beat, authored: authored.filter(gate => gate.section === name).length };
  });
  return {
    volume, rules, authored, branch, layout, sections,
    endingCue: ending ? volume.beats - ending.beats : id === 'elsewhere' ? volume.beats - ELSEWHERE_ESCAPE_BEATS : undefined,
    pickup: pickup && simulation.pickup && { ...pickup, kind: simulation.pickup.kind, station: simulation.pickupStation },
    plan: simulation.outroPlan,
    reference: simulation.reference,
    gatesFor(route: RouteKind) {
      const side = routeSides.find(side => layout[side] === route)!;
      const replacement = simulation.branchGates?.[route] ?? [];
      const gates = [...simulation.mainGates, ...replacement].sort((a, b) => a.beat - b.beat).map(gate => ({
        beat: gate.beat, kind: gate.kind, open: gate.open, axis: gate.axis, inserted: !!gate.inserted,
        worldStation: gate.worldStation, route: gate.route, section: sectionAt(volume, gate.beat)!.name,
      }));
      return { side, replacementCount: replacement.length, gates };
    },
  };
}
