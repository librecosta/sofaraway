import { runRandomWord } from './run-seed';

const kinds = ['shield', 'resonance', 'lumen'] as const;
export type PickupKind = typeof kinds[number];
export type PickupStatus = 'pending' | 'collected' | 'missed';
export interface RunPickup {
  readonly kind: PickupKind;
  readonly status: PickupStatus;
}

export const PICKUP_BEAT = 306.66;
export const PICKUP_PREVIEW_BEATS = 8;
export const PICKUP_APPEAR_BEAT = PICKUP_BEAT - PICKUP_PREVIEW_BEATS;
export const PICKUP_LOCAL_X = 0;
export const PICKUP_LOCAL_Y = 1;
export const PICKUP_RADIUS = 0.7;
export const RESONANCE_CHARGES = 8;
export const RESONANCE_BONUS = 0.25;
export const LUMEN_POINTS = { easy: 2500, normal: 5000, hard: 7500, impossible: 10000 } as const;

export function pickupForSeed(seed: number): PickupKind {
  return kinds[runRandomWord(seed, 0x5049434b) % kinds.length];
}

/** One of each kind per three encounters. An aborted approach does not spend the draw. */
export class PickupDeck {
  private remaining: PickupKind[] = [];

  peek(seed: number): PickupKind {
    if (!this.remaining.length) {
      const first = pickupForSeed(seed);
      const rest = kinds.filter(kind => kind !== first);
      if (runRandomWord(seed, 0x504f5244) % 2) rest.reverse();
      this.remaining = [first, ...rest];
    }
    return this.remaining[0];
  }

  consume() { this.remaining.shift(); }
}
