import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { initialSnapshot } from '../game/contracts';
import type { Difficulty, ExperienceMode, GameOptions, GameRuntime, GameSnapshot, OrientationPreference, QualityTier, VolumeId } from '../game/contracts';
import type { Runtime } from '../game/runtime/GameRuntime.client';
import type { PlayerSurface } from '../game/runtime/player-surface';
import type { RunSettlement } from '../game/runtime/run-settlement';
import { immersiveMouseSupported, subscribeImmersiveMouseSupport } from '../game/runtime/immersive-mouse.client';
import { FullscreenOrientation, isCompactTouchDevice } from '../game/runtime/screen-orientation.client';
import { readOrientationPreference } from '../game/runtime/settings.client';
import type { PlayerSettings } from '../game/runtime/settings.client';
import { usePlayerText } from '../i18n/PlayerLocale';
import { classes as c } from '../styles/classes';
import { CreditsPanel } from './CreditsPanel';
import { GameFallback, isBlockingFallback } from './GameFallback';
import { GameHUD } from './GameHUD';
import { MainMenu } from './MainMenu';
import { ResultsScreen } from './ResultsScreen';
import { SettingsPanel } from './SettingsPanel';

const noSubscribe = () => () => {};
const getInitialSnapshot = () => initialSnapshot;
const cueControls = 'button:not(:disabled), a[href], input[type="checkbox"]:not(:disabled)';
const menuFields = ['phase', 'volumeId', 'difficulty', 'mode', 'quality', 'volume', 'muted', 'error', 'pauseReason', 'result',
  'localRecord', 'newBest', 'message', 'dynamicLights', 'showcaseRoute', 'immersiveMouse', 'autoBoost',
  ...(typeof __LIVE_GATE_QUALITY_DEV__ !== 'undefined' && __LIVE_GATE_QUALITY_DEV__ ? ['gateQualityDebug'] as const : [])] as const;
const mouseSupported = () => immersiveMouseSupported();
const unsupportedOnServer = () => false;

function useMenuSnapshot(runtime: GameRuntime | null) {
  const previous = useRef<GameSnapshot>(initialSnapshot);
  return useSyncExternalStore(runtime?.subscribe ?? noSubscribe, () => {
    const next = runtime?.getSnapshot() ?? initialSnapshot;
    if (menuFields.some(key => next[key] !== previous.current[key])) previous.current = next;
    return previous.current;
  }, getInitialSnapshot);
}

interface Props {
  settings: PlayerSettings;
  volume: VolumeId;
  chooseVolume(volume: VolumeId): void;
  launch(): { options: GameOptions; hideUi?: boolean; openSettings?: boolean };
  onQualityChanged?(quality: QualityTier): void;
  renderCredits?(volume: VolumeId, close: () => void): ReactNode;
  share?(): void;
  shareNotice?: ReactNode;
  socialLinks?: ReactNode;
  compliance?: ReactNode;
  surface?: PlayerSurface;
  extension?: {
    menu(open: () => void): ReactNode;
    results(run: RunSettlement, snapshot: GameSnapshot): ReactNode;
    panel(volume: VolumeId, close: () => void): ReactNode;
  };
  display?: {
    touch: boolean;
    startLabel?: string;
    status?: string;
    orientation?: { value: OrientationPreference; choose(value: OrientationPreference): void; pending: boolean };
    action?: { active: boolean; label: string; toggle(): void; pending: boolean };
  };
  diagnostics?: { output: ReactNode; write(text: string): void; launchFailed(error: unknown): void };
}

export function GameViewport({ settings, volume: requested, chooseVolume, launch, onQualityChanged, renderCredits,
  share, shareNotice, socialLinks, compliance, diagnostics, surface, display, extension }: Props) {
  const { text } = usePlayerText();
  const canvasLabel = text.t('canvasLabel');
  const currentCanvasLabel = useRef(canvasLabel);
  currentCanvasLabel.current = canvasLabel;
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [mount, setMount] = useState(0);
  const [panel, setPanel] = useState<'settings' | 'credits' | 'extension' | null>(null);
  const [settlement, setSettlement] = useState<RunSettlement>();
  const [hideUi, setHideUi] = useState(false);
  const [fullscreenState, setFullscreenState] = useState({ available: false, active: false });
  const [fullscreenFailed, setFullscreenFailed] = useState(false);
  const [orientation, setOrientation] = useState<OrientationPreference | null>(null);
  const orientationLock = useRef<FullscreenOrientation | null>(null);
  const immersiveMouseAvailable = useSyncExternalStore(subscribeImmersiveMouseSupport, mouseSupported, unsupportedOnServer);
  const snapshot = useMenuSnapshot(runtime);
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const panelReturnFocus = useRef<HTMLElement | null>(null);
  const runReturnFocus = useRef(false);
  const volumeTarget = useRef<VolumeId | null>(null);
  const previousRequest = useRef<VolumeId | null>(null);
  const keys = useRef<(key: string, event: KeyboardEvent) => boolean>(() => false);

  function openPanel(value: NonNullable<typeof panel>) {
    const focused = document.activeElement;
    panelReturnFocus.current = focused instanceof HTMLElement && focused !== document.body
      ? focused : viewport.current?.querySelector<HTMLElement>(`[data-act=${value}]`) ?? null;
    setPanel(value);
  }

  useEffect(() => {
    if (!panel) {
      panelReturnFocus.current?.focus();
      panelReturnFocus.current = null;
    }
  }, [panel]);

  useEffect(() => {
    keys.current = (key, event) => {
      if (panel) {
        if (key === 'escape') setPanel(null);
        return true;
      }
      if (event.defaultPrevented) return true;
      if (snapshot.phase === 'menu' && !snapshot.error && !event.repeat && key === 'x' &&
        !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        if (action?.pending) return true;
        if (event.isTrusted) runtime?.playUiCue('press');
        startSelected(event);
        return true;
      }
      return false;
    };
  });

  useEffect(() => {
    const root = viewport.current;
    if (!root || !isCompactTouchDevice()) return;
    const preference = readOrientationPreference(settings);
    const events = new AbortController();
    const lock = new FullscreenOrientation(root, preference);
    orientationLock.current = lock;
    setOrientation(preference);
    window.addEventListener('pagehide', () => lock.release(), { signal: events.signal });
    return () => {
      events.abort();
      orientationLock.current = null;
      lock.release();
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const active = document.fullscreenElement === viewport.current;
      if (!active) orientationLock.current?.release();
      setFullscreenState({
        available: document.fullscreenEnabled && typeof viewport.current?.requestFullscreen === 'function' &&
          typeof document.exitFullscreen === 'function',
        active,
      });
      setFullscreenFailed(false);
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    const element = host.current!;
    const canvas = document.createElement('canvas');
    canvas.id = 'gl';
    canvas.setAttribute('aria-label', currentCanvasLabel.current);
    element.append(canvas);
    const { options, hideUi, openSettings } = launch();
    setHideUi(!!hideUi);
    if (openSettings) setPanel('settings');
    let stale = false;
    let engine: Runtime | undefined;
    void import('../game/runtime/GameRuntime.client').then(({ Runtime }) => {
      if (stale || surface?.getSnapshot().lifecycle === 'closed') return;
      engine = new Runtime({
        pointer(state) {
          if (!cursor.current) return;
          cursor.current.style.transform = `translate3d(${state.x}px,${state.y}px,0)`;
          cursor.current.className = c(!state.visible && 'hidden', state.hover && 'hover', state.down && 'down',
            state.locked && 'lock', state.immersive && 'immersive');
        },
        flash(opacity, color, daylight = 0) {
          if (!flash.current) return;
          flash.current.style.backgroundColor = color;
          flash.current.style.opacity = String(opacity);
          const styles = flash.current.parentElement?.style;
          if (styles && Number(styles.getPropertyValue('--escape-white')) !== daylight) styles.setProperty('--escape-white', String(daylight));
        },
        debug: diagnostics?.write,
        key: (key, event) => keys.current(key, event),
        muted: value => settings.save('muted', value),
        settled: extension ? setSettlement : undefined,
      }, settings.namespace, surface);
      setRuntime(engine);
      return engine.initialize(canvas, { ...options, compactViewport: orientationLock.current !== null, saveRecords: true });
    }).catch(error => {
      if (!stale) {
        diagnostics?.launchFailed(error);
        setImportError(true);
      }
    });
    return () => {
      stale = true;
      engine?.dispose();
      canvas.remove();
    };
  }, [mount]);

  useEffect(() => {
    host.current?.querySelector('canvas')?.setAttribute('aria-label', canvasLabel);
  }, [canvasLabel]);

  useEffect(() => {
    if (!runtime || snapshot.error?.kind === 'graphics' ||
      ['uninitialized', 'initializing', 'unsupported', 'error', 'disposed'].includes(snapshot.phase)) return;
    if (previousRequest.current === requested) return;
    previousRequest.current = requested;
    if (requested === snapshot.volumeId) return;
    if (snapshot.phase !== 'menu' && snapshot.phase !== 'results') runtime.returnToMenu();
    void runtime.selectVolume(requested);
  }, [runtime, requested, snapshot.volumeId, snapshot.phase, snapshot.error]);

  function startSelected(gesture: Event) {
    if (!runtime || snapshot.phase !== 'menu' || snapshot.error || action?.pending) return;
    const id = volumeTarget.current;
    if (id && id !== snapshot.volumeId) {
      chooseVolume(id);
      void runtime.selectVolume(id);
    }
    void runtime.start(false, gesture);
  }

  const [importError, setImportError] = useState(false);
  const viewSnapshot: GameSnapshot = importError ? {
    ...snapshot, phase: 'error', error: { kind: 'runtime', message: 'gameLoadFailed' },
  } : snapshot;
  const menuVisible = ['uninitialized', 'initializing', 'menu', 'starting', 'unsupported', 'error'].includes(viewSnapshot.phase);
  const modalOpen = !!panel || isBlockingFallback(viewSnapshot);
  const uiCursor = viewSnapshot.phase === 'menu' || viewSnapshot.phase === 'results';
  const showcase = viewSnapshot.mode === 'showcase';
  const showcaseFlight = showcase && ['playing', 'crash'].includes(viewSnapshot.phase);
  const customCursor = uiCursor || viewSnapshot.phase === 'playing' && !modalOpen && !showcase;
  const returnToMenu = () => runtime?.returnToMenu();

  useEffect(() => {
    if (viewSnapshot.phase === 'starting' || viewSnapshot.phase === 'playing') runReturnFocus.current = true;
    if (viewSnapshot.phase === 'menu' && !modalOpen && runReturnFocus.current) {
      runReturnFocus.current = false;
      viewport.current?.querySelector<HTMLElement>('[data-act=start]:not(:disabled)')?.focus();
    }
  }, [viewSnapshot.phase, modalOpen]);

  function setDifficulty(value: Difficulty) {
    runtime?.setDifficulty(value);
    if (runtime?.getSnapshot().difficulty === value) settings.save('difficulty', value);
  }

  function setMode(value: ExperienceMode) {
    runtime?.setMode(value);
    if (runtime?.getSnapshot().mode === value) settings.save('mode', value);
  }

  function setDynamicLights(value: boolean) {
    runtime?.setDynamicLights(value);
    if (runtime?.getSnapshot().dynamicLights === value) settings.save('dynamicLights', value);
  }

  function setImmersiveMouse(value: boolean) {
    runtime?.setImmersiveMouse(value);
    if (runtime?.getSnapshot().immersiveMouse === value) settings.save('immersiveMouse', value);
  }

  function setAutoBoost(value: boolean) {
    if (!runtime || snapshot.phase !== 'menu') return;
    runtime.setAutoBoost(value);
    if (runtime.getSnapshot().autoBoost === value) settings.save('autoBoost', value);
  }

  function chooseOrientation(value: OrientationPreference) {
    setOrientation(value);
    settings.save('orientation', value);
    orientationLock.current?.choose(value);
  }

  async function setQuality(value: QualityTier) {
    await runtime?.setQuality(value);
    if (runtime?.getSnapshot().quality !== value) return;
    settings.save('quality', value);
    onQualityChanged?.(value);
  }

  function tryAgain(event?: MouseEvent<HTMLButtonElement>) {
    if (viewSnapshot.phase === 'unsupported' || viewSnapshot.phase === 'error' ||
      (viewSnapshot.phase === 'menu' && viewSnapshot.error?.kind === 'graphics')) {
      setImportError(false);
      setRuntime(null);
      setMount(value => value + 1);
    } else if (viewSnapshot.phase === 'paused') void runtime?.resume(undefined, event?.nativeEvent);
    else void runtime?.start(false, event?.nativeEvent);
  }

  async function fullscreen() {
    if (action) {
      action.toggle();
      return;
    }
    const element = viewport.current;
    try {
      if (!element || !fullscreenState.available) throw new Error('Fullscreen unavailable');
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else {
        await element.requestFullscreen();
        if (viewport.current === element) orientationLock.current?.choose(readOrientationPreference(settings));
      }
    } catch {
      setFullscreenFailed(true);
      runtime?.showMessage({ id: 'fullscreenUnavailableNotice' });
    }
  }

  const action = fullscreenState.active ? undefined : display?.action;
  const hideFullscreen = !!surface && !action && !fullscreenState.available;
  return (
    <main ref={viewport} data-container-touch={display?.touch || undefined}
      className={c('viewport', (orientation !== null || display?.touch === true) && 'compact-touch',
      customCursor && 'custom-cursor', showcaseFlight && 'showcase-flight')}
      onPointerOver={event => {
        if (!uiCursor || !event.isTrusted || event.pointerType === 'touch') return;
        const control = (event.target as Element).closest(cueControls);
        if (control && !control.matches('[data-language], [data-display-action]') &&
          !(event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) {
          runtime?.playUiCue('hover');
        }
      }}
      onClickCapture={event => {
        if (!uiCursor || !event.isTrusted) return;
        if ((event.target as Element).closest('[data-language], [data-display-action]')) return;
        if ((event.target as Element).closest(cueControls)) runtime?.playUiCue('press');
        else runtime?.primeAudio();
      }}
      onKeyDownCapture={event => {
        if (uiCursor && event.isTrusted && !event.repeat && navigator.userActivation?.isActive &&
          !(event.target as Element).closest('[data-language], [data-display-action]')) runtime?.primeAudio();
      }}>
      <div ref={host} />
      <div id="cursor" ref={cursor} aria-hidden="true" hidden={!customCursor}>
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <circle className={c('c-ring')} r="9.5" />
          <path className={c('c-tick', 't')} d="M0 -18v5" />
          <path className={c('c-tick', 'b')} d="M0 13v5" />
          <path className={c('c-tick', 'l')} d="M-18 0h5" />
          <path className={c('c-tick', 'r')} d="M13 0h5" />
          <circle className={c('c-dot')} r="1.5" />
        </svg>
      </div>
      <div id="ui" style={{ display: hideUi ? 'none' : undefined }}>
        <div inert={modalOpen}>
          <MainMenu snapshot={viewSnapshot} visible={menuVisible} chooseDifficulty={setDifficulty} chooseMode={setMode} chooseVolume={chooseVolume}
            chooseShowcaseRoute={value => runtime?.setShowcaseRoute(value)}
            setMuted={value => {
              runtime?.setMuted(value);
              if (!value) runtime?.playUiCue('press');
            }} onVolumeTarget={id => { volumeTarget.current = id; }}
            start={event => startSelected(event.nativeEvent)} settings={() => openPanel('settings')} credits={() => openPanel('credits')}
            share={share} socialLinks={socialLinks} fullscreen={fullscreen} fullscreenActive={fullscreenState.active}
            displayLabel={action?.label} displayPending={action?.pending} displayStatus={display?.status}
            fullscreenHidden={hideFullscreen} touchStartLabel={display?.startLabel} compliance={compliance}
            extra={extension?.menu(() => openPanel('extension'))} />
          {!showcase && <GameHUD runtime={runtime} />}
          <ResultsScreen snapshot={snapshot} restart={event => void runtime?.start(false, event.nativeEvent)} menu={returnToMenu}>
            {snapshot.phase === 'results' && settlement && snapshot.result === settlement.result &&
              extension?.results(settlement, snapshot)}
          </ResultsScreen>
        </div>
        <div id="flash" ref={flash} />
        <div id="shade" />
        {!panel && <GameFallback snapshot={viewSnapshot} retry={tryAgain} menu={returnToMenu} settings={() => openPanel('settings')}
          startSilent={event => {
            if (snapshot.phase === 'paused') void runtime?.resume(true, event.nativeEvent);
            else void runtime?.start(true, event.nativeEvent);
          }} />}
        {panel === 'credits' && (renderCredits
          ? renderCredits(snapshot.volumeId, () => setPanel(null))
          : <CreditsPanel close={() => setPanel(null)} />)}
        {panel === 'extension' && extension?.panel(snapshot.volumeId, () => setPanel(null))}
        {shareNotice}
      </div>
      {diagnostics?.output}
      {panel === 'settings' && <SettingsPanel snapshot={snapshot} close={() => setPanel(null)}
        chooseQuality={value => void setQuality(value)}
        setVolume={value => { runtime?.setVolume(value); settings.save('volume', Math.round(value * 100)); }}
        setMuted={value => runtime?.setMuted(value)} setDynamicLights={setDynamicLights}
        {...(typeof __LIVE_GATE_QUALITY_DEV__ !== 'undefined' && __LIVE_GATE_QUALITY_DEV__ && runtime
          ? { setGateQualityDebug: runtime.setGateQualityDebug } : {})}
        immersiveMouseAvailable={immersiveMouseAvailable && !display?.touch} setImmersiveMouse={setImmersiveMouse} setAutoBoost={setAutoBoost}
        orientation={(action ? display?.orientation : undefined) ??
          (orientation !== null && (!surface || fullscreenState.available) ? { value: orientation, choose: chooseOrientation } : undefined)}
        fullscreen={action ? { ...action, available: true, status: display?.status } :
          { ...fullscreenState, toggle: () => void fullscreen(), failed: fullscreenFailed, hidden: hideFullscreen }} />}
    </main>
  );
}
