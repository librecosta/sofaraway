import { initialSnapshot } from '../contracts';
import type { GameSnapshot, RunResult } from '../contracts';

export const studioGroups = ['Menu', 'Gameplay', 'Results', 'Overlays', 'Recovery & Errors', 'Responsive'] as const;
export const studioSizes = [[1920,1080], [1280,720], [960,540], [390,844], [320,568], [667,375]] as const;

export interface UIState {
  id: string;
  name: string;
  group: typeof studioGroups[number];
  component: string;
  trigger: string;
  recovery: string;
  snapshot: GameSnapshot;
  overlay?: 'settings' | 'credits' | 'music' | 'share-success' | 'share-failure';
  interaction?: 'wheel' | 'difficulty';
  size?: number;
}

const empty = initialSnapshot.localRecord;
const escaped = { best: 372231, last: { score: 372231, outcome: 'ESCAPED' } } as const;
const terminated = { best: 372231, last: { score: 97450, outcome: 'TERMINATED' } } as const;
const main = { ...initialSnapshot, phase: 'menu' } as const;
const play = { ...main, phase: 'playing', section: 'DROP', score: 82641, gatesPassed: 49, gatesTotal: 141,
  progress: .48, combo: 12, maxCombo: 16, lives: 2, maxLives: 3, speed: 34 } as const;
const result: RunResult = { title: 'ESCAPED', rank: 'S', accuracy: .99, planned: 141,
  encountered: 141, passed: 139, neutralized: 0, unreached: 0, route: 'main' };
const resultSnapshot = { ...play, phase: 'results', score: 372231, result, gatesPassed: 139, maxCombo: 57,
  localRecord: escaped } as const;
const encore = { encountered: 24, passed: 24, clean: 24, missed: 0, neutralized: 0, combo: 24, maxCombo: 24, bonusScore: 7200 };

function menu(id: string, name: string, patch: Partial<GameSnapshot> = {}, extra: Partial<UIState> = {}): UIState {
  return { id, name, group: 'Menu', component: 'MainMenu', trigger: 'The run is ready at the main menu.',
    recovery: 'Interactive menu.', snapshot: { ...main, ...patch }, ...extra };
}
function gameplay(id: string, name: string, trigger: string, patch: Partial<GameSnapshot> = {}): UIState {
  return { id, name, group: 'Gameplay', component: 'GameHUD', trigger, recovery: 'The run can continue.',
    snapshot: { ...play, ...patch } };
}
function results(id: string, name: string, patch: Partial<RunResult> = {}, snapshot: Partial<GameSnapshot> = {}): UIState {
  return { id, name, group: 'Results', component: 'ResultsScreen', trigger: 'The run reaches its final result.',
    recovery: 'Restart or return to the menu.', snapshot: { ...resultSnapshot, ...snapshot, result: { ...result, ...patch } } };
}
function overlay(id: string, name: string, layer: UIState['overlay'], trigger: string,
  patch: Partial<GameSnapshot> = {}): UIState {
  const component = layer === 'settings' ? 'SettingsPanel' : layer === 'credits' ? 'CreditsPanel'
    : layer === 'music' ? 'MusicInfo' : 'ShareToast';
  return menu(id, name, patch, { group: 'Overlays', component, overlay: layer, trigger,
    recovery: layer?.startsWith('share-') ? 'Feedback clears automatically.' : 'Dismiss to return to the underlying screen.' });
}
function system(id: string, name: string, patch: Partial<GameSnapshot>, trigger: string, recovery: string): UIState {
  return { id, name, group: 'Recovery & Errors', component: patch.phase === 'starting' || patch.phase === 'initializing'
    ? 'MainMenu' : patch.soundUnavailable ? 'GameHUD' : 'GameFallback',
    trigger, recovery, snapshot: { ...(['paused','playing'].includes(patch.phase ?? '') ? play : main), ...patch } };
}

export const uiStates: readonly UIState[] = [
  menu('elsewhere', 'ELSEWHERE Standard'),
  menu('impossible', 'ELSEWHERE Impossible', { difficulty: 'impossible', localRecord: escaped }),
  menu('drift', 'DAYBREAK Standard', { volumeId: 'drift' }),
  menu('descent', 'DESCENT Standard', { volumeId: 'descent' }),
  menu('orbit', 'ORBIT Standard', { volumeId: 'orbit' }),
  menu('sightseeing', 'Sightseeing', { mode: 'sightseeing', localRecord: { best: null, last: { score: 8421, outcome: 'ESCAPED' } } }),
  menu('no-records', 'No Best / Last', { localRecord: empty }),
  menu('record-success', 'Best / Last · Escaped', { localRecord: escaped }),
  menu('record-failure', 'Best / Last · Terminated', { localRecord: terminated }),
  menu('sound-on', 'Sound On'),
  menu('sound-off', 'Sound Muted', { muted: true }),
  menu('music-closed', 'Music Info Closed'),
  menu('wheel-motion', 'Volume Wheel in Motion', {}, { interaction: 'wheel', trigger: 'A volume wheel gesture settles on the next track.' }),
  menu('difficulty-motion', 'Difficulty in Motion', {}, { interaction: 'difficulty', trigger: 'The player steps to another difficulty.' }),
  gameplay('playing', 'Playing', 'A run is active.'),
  gameplay('shield', 'Playing · Shield', 'The player picked up a shield.', { shield: true }),
  gameplay('resonance', 'Playing · Resonance', 'A resonance multiplier is active.', { resonance: 3 }),
  gameplay('boost', 'Playing · Boost', 'The player holds Boost.', { boosting: true, speed: 49.3 }),
  gameplay('encore', 'Playing · Encore', 'Standard flight reaches the reward gates.', { outroPhase: 'encore', section: 'FINALE', message: 'ENCORE CLEAN' }),
  gameplay('sound-off', 'Playing · Sound Unavailable', 'Audio output dropped during the run.', { soundUnavailable: true }),
  results('escaped-s', 'ESCAPED · S'),
  results('escaped-a', 'ESCAPED · A', { rank: 'A', accuracy: .91, passed: 128 }, { gatesPassed: 128 }),
  results('escaped-b', 'ESCAPED · B', { rank: 'B', accuracy: .78, passed: 110 }, { gatesPassed: 110 }),
  results('escaped-c', 'ESCAPED · C', { rank: 'C', accuracy: .64, passed: 90 }, { gatesPassed: 90 }),
  results('terminated', 'TERMINATED', { title: 'TERMINATED', rank: 'C', accuracy: .58, encountered: 51, passed: 48, unreached: 90 },
    { gatesPassed: 48, score: 97450, lives: 0, localRecord: terminated }),
  results('new-best', 'New Best', {}, { newBest: true }),
  results('impossible-complete', 'Impossible Complete', { planned: 184, encountered: 184, passed: 183 },
    { difficulty: 'impossible', gatesTotal: 184, gatesPassed: 183, score: 726312 }),
  results('encore-complete', 'Main Complete · Encore Bonus', { encore }),
  results('encore-partial', 'Partial Encore', { encore: { ...encore, encountered: 10, passed: 7, clean: 4, missed: 3,
    combo: 3, maxCombo: 4, bonusScore: 1800 } }),
  results('sightseeing-complete', 'Sightseeing Complete', {}, { mode: 'sightseeing', maxLives: 5, score: 8421 }),
  results('best-ineligible', 'Recovery · Best Ineligible', { neutralized: 4 }, { score: 428230 }),
  results('no-encore', 'No Encore'),
  results('no-history', 'Result with No Prior Record', {}, { localRecord: empty }),
  overlay('settings', 'Settings Default', 'settings', 'Settings opens from the menu.'),
  overlay('settings-muted', 'Settings Muted', 'settings', 'Mute is enabled.', { muted: true }),
  overlay('settings-lights', 'Settings Dynamic Lights On', 'settings', 'Dynamic lights are enabled.', { dynamicLights: true }),
  overlay('settings-quality-disabled', 'Settings Quality Disabled', 'settings', 'Settings opens during a pause.', { phase: 'paused', pauseReason: 'user' }),
  overlay('credits', 'Credits', 'credits', 'The player opens Credits.'),
  overlay('music-open', 'Music Info Open', 'music', 'The player hovers or focuses the sound control.'),
  overlay('share-success', 'Share Success', 'share-success', 'The clipboard accepts the link.'),
  overlay('share-failure', 'Share Failure', 'share-failure', 'The clipboard rejects the link.'),
  overlay('share-repeat', 'Repeated Share Toast', 'share-success', 'Repeated share attempts reset the feedback timer.'),
  menu('menu-message', 'Menu Message', { message: 'FULL SCREEN UNAVAILABLE' },
    { group: 'Overlays', trigger: 'The browser declines a full screen request.', recovery: 'Non-blocking feedback.' }),
  system('initializing', 'Initializing', { phase: 'initializing' }, 'Graphics and the selected volume are loading.', 'Wait for the menu.'),
  system('starting', 'Starting', { phase: 'starting' }, 'The run is starting and waiting for audio.', 'Wait or use the audio recovery actions.'),
  system('pause-user', 'Paused · User', { phase: 'paused', pauseReason: 'user' }, 'The player pauses the run.', 'Resume, open settings, or return to menu.'),
  system('pause-background', 'Paused · Background', { phase: 'paused', pauseReason: 'background' }, 'The page leaves the foreground.', 'Return to the tab and resume.'),
  system('pause-context', 'Paused · Context', { phase: 'paused', pauseReason: 'context' }, 'A controlled pause was requested for a graphics interruption.',
    'Resume after graphics are available. Ordinary WebGL recovery uses the non-blocking notice.'),
  system('unsupported', 'Unsupported Graphics', { phase: 'unsupported', error: { kind: 'graphics', message: 'This browser could not start WebGL2.' } },
    'The browser cannot create a WebGL2 context.', 'Blocking. Try again after enabling WebGL2 or changing browsers.'),
  system('graphics-init', 'Graphics Initialization Failure', { phase: 'error', error: { kind: 'graphics', message: 'Could not initialize a required graphics resource.' } },
    'The renderer or a critical resource fails to initialize.', 'Blocking. Try to initialize again.'),
  system('context-pending', 'Graphics Recovery Pending', { phase: 'playing', error: { kind: 'graphics', message: 'Graphics were interrupted. Waiting for WebGL to recover.' } },
    'The browser reports a lost context.', 'Non-blocking. The renderer waits for automatic recovery.'),
  system('context-failed', 'Graphics Recovery Failed', { phase: 'error', error: { kind: 'graphics', stage: 'recovery', message: 'WebGL did not recover. Try again to start a new run.' } },
    'The recovery deadline expires.', 'The interrupted run cannot resume. Try again to initialize a new session.'),
  system('audio-start', 'Audio Start Failure', { error: { kind: 'audio', message: 'Audio could not start. Try again or play with sound off.' } },
    'The browser does not allow audio to start.', 'Blocking but recoverable. Retry or continue without sound.'),
  system('silent', 'Silent Continuation', { phase: 'playing', soundUnavailable: true }, 'The player continues without sound.', 'Restore audio with a user gesture.'),
  system('audio-unavailable', 'Audio Temporarily Unavailable', { phase: 'playing', soundUnavailable: true }, 'Audio drops out during a run.', 'Non-blocking. Restore audio when available.'),
  system('runtime-error', 'Runtime Error', { phase: 'error', error: { kind: 'runtime', message: 'The game could not load.' } },
    'A fatal game or module error prevents the run from continuing.', 'The current run cannot resume. Try to initialize again.'),
  { ...system('error-message', 'Error Message', { error: { kind: 'audio', message: 'Audio could not start. Try again or play with sound off.' } },
    'Audio start failed.', 'Retry or continue without sound.'), group: 'Overlays' },
  { ...system('long-error', 'Long Error Text', { phase: 'error', error: { kind: 'runtime', message: ('The game could not load its resources. Try again after checking your browser settings and available memory. ').repeat(8) } },
    'A fatal error reports extended diagnostic text.', 'The message remains scrollable before retrying.'), group: 'Responsive', size: 4 },
  menu('narrow-records', 'Narrow View · Long Records', { localRecord: { ...escaped, best: 983409272, last: { score: 642130961, outcome: 'ESCAPED' } } },
    { group: 'Responsive', size: 4 }),
  { ...results('landscape-results', 'Landscape · Full Results', { encore, neutralized: 4 }, { difficulty: 'impossible' }),
    group: 'Responsive', size: 5 },
];
