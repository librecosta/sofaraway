import type { GateCrossingQuality } from './crossing-quality';

export const SCORING_RULES_VERSION = 'precision-v5';
export const TRAVEL_POINTS_PER_UNIT = .35;
export const MAIN_GATE_POINTS = 100;
export const BOOST_GATE_MULTIPLIER = 1.5;
export const COMBO_SCORE_CAP = 50;
export const COMBO_SCORE_STEP = .05;
export const MAIN_QUALITY_BONUS = { normal: 0, precision: 150, nearMiss: 225 } as const satisfies Record<GateCrossingQuality, number>;
export const ENCORE_BASE_POINTS = 200;
export const ENCORE_QUALITY_BONUS = { normal: 0, precision: 100, nearMiss: 150 } as const satisfies Record<GateCrossingQuality, number>;
