import type { BranchSpec } from './branches';
import { elsewhereBranch } from './branches';
import { DAYBREAK_PICKUP_BEAT, daybreakJunctionWindow, daybreakRouteCharts } from './daybreak-chart';
import { PICKUP_APPEAR_BEAT, PICKUP_BEAT, PICKUP_LOCAL_X, PICKUP_LOCAL_Y, PICKUP_RADIUS } from './pickups';
import type { GateKind } from './volumes';
import type { VolumeId } from '../contracts';
import { clamp } from './collision';

interface PickupSpec { beat: number; preview: number; x: number; y: number; radius: number }
interface EncoreSpec { first: number; minSpacing: number; maxSpacing: number; kinds: readonly GateKind[]; reserve: number }
interface GameplaySpec {
  branch?: BranchSpec;
  pickup?: PickupSpec;
  encore?: 'legacy' | EncoreSpec;
  ending?: { beats: number; protectGates: boolean };
  world?: { continuous: boolean; settleResults: boolean };
}

const window = daybreakJunctionWindow;
const gameplay: Partial<Record<VolumeId, GameplaySpec>> = {
  elsewhere: {
    branch: elsewhereBranch,
    pickup: { beat: PICKUP_BEAT, preview: PICKUP_APPEAR_BEAT, x: PICKUP_LOCAL_X, y: PICKUP_LOCAL_Y, radius: PICKUP_RADIUS },
    encore: 'legacy',
  },
  daybreak: {
    branch: {
      ...window, open: { standard: window.open, sightseeing: window.open },
      merge: { standard: window.merge, sightseeing: window.merge },
      guideEnd: 231, spacing: 11.2, rise: 3.2, sightseeingPattern: 'even', charts: daybreakRouteCharts,
    },
    pickup: { beat: DAYBREAK_PICKUP_BEAT, preview: DAYBREAK_PICKUP_BEAT - 8, x: 0, y: 0, radius: PICKUP_RADIUS },
    encore: { first: 100, minSpacing: 75, maxSpacing: 85,
      kinds: ['daybreak-vertical', 'daybreak-crystal', 'daybreak-horizontal', 'daybreak-crystal'], reserve: 10 },
    ending: { beats: 12, protectGates: true },
    world: { continuous: true, settleResults: true },
  },
};

export function gameplayFor(id: VolumeId): GameplaySpec { return gameplay[id] ?? {}; }

export function daylightFade(phase: number, ahead = Infinity, remainingTravel = 0) {
  const protection = clamp((remainingTravel + 8 - ahead) / 8, 0, 1) * clamp((60 - ahead) / 38, 0, 1);
  return phase * phase * (3 - 2 * phase) * (1 - .86 * protection);
}
