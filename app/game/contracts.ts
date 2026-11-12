import type { BranchLayout, RouteKind, RouteSide } from './core/branches';

export type VolumeId = 'elsewhere' | 'drift' | 'descent' | 'orbit';
export const playModes = ['standard', 'sightseeing'] as const;
export type PlayMode = typeof playModes[number];
export const difficulties = ['easy', 'normal', 'hard'] as const;
export type Difficulty = typeof difficulties[number];
export const qualities = ['high', 'auto', 'low'] as const;
export type QualityTier = typeof qualities[number];
export type PauseReason = 'user' | 'background' | 'context' | 'audio' | 'long-frame';
export type GamePhase = 'uninitialized' | 'initializing' | 'menu' | 'starting' | 'playing'
  | 'paused' | 'crash' | 'results' | 'unsupported' | 'error' | 'disposed';

export interface RunResult {
  readonly title: 'ESCAPED' | 'TERMINATED';
  readonly accuracy: number;
  readonly rank: 'S' | 'A' | 'B' | 'C';
  readonly route?: RouteKind;
}

export interface GameError {
  readonly kind: 'audio' | 'graphics' | 'runtime';
  readonly message: string;
}

export interface GameSnapshot {
  readonly phase: GamePhase;
  readonly volumeId: VolumeId;
  readonly difficulty: Difficulty;
  readonly mode: PlayMode;
  readonly score: number;
  readonly lives: number;
  readonly maxLives: number;
  readonly gatesPassed: number;
  readonly gatesTotal: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly progress: number;
  readonly section: string;
  readonly quality: QualityTier;
  readonly volume: number;
  readonly muted: boolean;
  readonly error: GameError | null;
  readonly pauseReason: PauseReason | null;
  readonly result: RunResult | null;
  readonly speed: number;
  readonly boosting: boolean;
  readonly shield: boolean;
  readonly resonance: number;
  readonly route: RouteKind | null;
  readonly routeHint: BranchLayout | null;
  readonly hint: boolean;
  readonly message: string;
}

export interface GameOptions {
  volumeId: VolumeId;
  difficulty: Difficulty;
  mode: PlayMode;
  quality: QualityTier;
  volume: number;
  muted: boolean;
  best: number;
  runSeed?: number;
  diagnostics: Diagnostics;
}

export interface Diagnostics {
  fixedTime: number | null;
  autoplay: boolean;
  god: boolean;
  align: boolean;
  boost: boolean;
  mobileQuality: boolean;
  post: boolean;
  record: boolean;
  debug: boolean;
  dof?: [aperture: number, maxBlur?: number];
  cursor?: [x: number, y: number];
  branchSide?: RouteSide;
}

export interface GameRuntime {
  initialize(canvas: HTMLCanvasElement, options: GameOptions): Promise<void>;
  start(silent?: boolean): Promise<void>;
  pause(reason: PauseReason): void;
  resume(silent?: boolean): Promise<void>;
  returnToMenu(): void;
  selectVolume(id: VolumeId): Promise<void>;
  setDifficulty(value: Difficulty): void;
  setMode(value: PlayMode): void;
  setQuality(value: QualityTier): Promise<void>;
  setVolume(value: number): void;
  setMuted(value: boolean): void;
  getSnapshot(): GameSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export const initialSnapshot: GameSnapshot = Object.freeze({
  phase: 'uninitialized',
  volumeId: 'elsewhere',
  difficulty: 'normal',
  mode: 'standard',
  score: 0,
  lives: 2,
  maxLives: 2,
  gatesPassed: 0,
  gatesTotal: 0,
  combo: 0,
  maxCombo: 0,
  progress: 0,
  section: 'INTRO',
  quality: 'auto',
  volume: 0.8,
  muted: false,
  error: null,
  pauseReason: null,
  result: null,
  speed: 24,
  boosting: false,
  shield: false,
  resonance: 0,
  route: null,
  routeHint: null,
  hint: false,
  message: '',
});
