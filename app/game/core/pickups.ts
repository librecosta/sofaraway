import { runRandomWord } from './run-seed';

const kinds = ['shield', 'resonance', 'lumen'] as const;
export type PickupKind = typeof kinds[number];
export type PickupStatus = 'pending' | 'collected' | 'missed';
export interface RunPickup {
  readonly kind: PickupKind;
  readonly status: PickupStatus;
}

export const PICKUP_BEAT = 306.66;
export const PICKUP_LOCAL_X = 0;
export const PICKUP_LOCAL_Y = 1;
export const PICKUP_RADIUS = 0.7;
export const RESONANCE_CHARGES = 8;
export const RESONANCE_BONUS = 0.25;
export const LUMEN_POINTS = { easy: 2500, normal: 5000, hard: 7500 } as const;

export function pickupForSeed(seed: number): PickupKind {
  return kinds[runRandomWord(seed, 0x5049434b) % kinds.length];
}
