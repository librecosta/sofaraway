import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { initialSnapshot } from '../game/contracts';
import type { Difficulty, ExperienceMode, GameRuntime, GameSnapshot, OrientationPreference, QualityTier, VolumeId } from '../game/contracts';
import { volumeById } from '../game/core/volumes';
import type { Runtime } from '../game/runtime/GameRuntime.client';
import { immersiveMouseSupported, subscribeImmersiveMouseSupport } from '../game/runtime/immersive-mouse.client';
import { FullscreenOrientation, isCompactTouchDevice } from '../game/runtime/screen-orientation.client';
import { readOptions, readOrientationPreference, saveSetting } from '../game/runtime/settings.client';
import { classes as c } from '../styles/classes';
import { CreditsPanel } from './CreditsPanel';
import { GameFallback, isBlockingFallback } from './GameFallback';
import { GameHUD } from './GameHUD';
import { MainMenu } from './MainMenu';
import { ResultsScreen } from './ResultsScreen';
import { SettingsPanel } from './SettingsPanel';
import { ShareToast, useShareToast } from './MenuUtilities';

const noSubscribe = () => () => {};
const getInitialSnapshot = () => initialSnapshot;
const cueControls = 'button:not(:disabled), a[href], input[type="checkbox"]:not(:disabled)';
const menuFields = ['phase', 'volumeId', 'difficulty', 'mode', 'quality', 'volume', 'muted', 'error', 'pauseReason', 'result',
  'localRecord', 'newBest', 'message', 'dynamicLights', 'showcaseRoute', 'immersiveMouse'] as const;
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

export function GameViewport() {
  const [search, setSearch] = useSearchParams();
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const rawVolume = search.get('vol');
  const requested = volumeById(rawVolume).id;
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [mount, setMount] = useState(0);
  const [panel, setPanel] = useState<'settings' | 'credits' | null>(null);
  const [hideUi, setHideUi] = useState(false);
  const [fullscreenState, setFullscreenState] = useState({ available: false, active: false });
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const [orientation, setOrientation] = useState<OrientationPreference | null>(null);
  const orientationLock = useRef<FullscreenOrientation | null>(null);
  const immersiveMouseAvailable = useSyncExternalStore(subscribeImmersiveMouseSupport, mouseSupported, unsupportedOnServer);
  const { notice, showNotice } = useShareToast();
  const shareRequest = useRef(0);
  const snapshot = useMenuSnapshot(runtime);
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const debug = useRef<HTMLPreElement>(null);
  const panelReturnFocus = useRef<HTMLElement | null>(null);
  const runReturnFocus = useRef(false);
  const volumeTarget = useRef<VolumeId | null>(null);
  const previousRequest = useRef<VolumeId | null>(null);
  const keys = useRef<(key: string, event: KeyboardEvent) => boolean>(() => false);

  useEffect(() => {
    if (rawVolume !== 'drift') return;
    const params = new URLSearchParams(search);
    params.set('vol', requested);
    void navigate({ pathname, search: `?${params.toString()}`, hash }, { replace: true, preventScrollReset: true });
  }, [hash, navigate, pathname, rawVolume, requested, search]);

  function chooseVolume(id: VolumeId) {
    if (search.get('vol') === id) return;
    const params = new URLSearchParams(search);
    params.set('vol', id);
    setSearch(params, { preventScrollReset: true });
  }

  function openPanel(value: 'settings' | 'credits') {
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
        if (event.isTrusted) runtime?.playUiCue('press');
        startSelected(event);
        return true;
      }
      return false;
    };
  });

  useEffect(() => () => { shareRequest.current++; }, []);

  useEffect(() => {
    const root = viewport.current;
    if (!root || !isCompactTouchDevice()) return;
    const preference = readOrientationPreference();
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
      setFullscreenMessage('');
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    const element = host.current!;
    const canvas = document.createElement('canvas');
    canvas.id = 'gl';
    canvas.setAttribute('aria-label', 'SoFarAway game viewport');
    element.append(canvas);
    const params = new URLSearchParams(location.search);
    setHideUi(params.get('ui') === '0');
    if (params.get('panel') === '1') setPanel('settings');
    const options = readOptions(params);
    let stale = false;
    let engine: Runtime | undefined;
    void import('../game/runtime/GameRuntime.client').then(({ Runtime }) => {
      if (stale) return;
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
        debug(text) { if (debug.current) debug.current.textContent = text; },
        key: (key, event) => keys.current(key, event),
        muted: value => saveSetting('muted', value),
      });
      setRuntime(engine);
      return engine.initialize(canvas, { ...options, compactViewport: orientationLock.current !== null, saveRecords: true });
    }).catch(error => {
      if (!stale) setImportError(error instanceof Error ? error.message : 'The game could not load.');
    });
    return () => {
      stale = true;
      engine?.dispose();
      canvas.remove();
    };
  }, [mount]);

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
    if (!runtime || snapshot.phase !== 'menu' || snapshot.error) return;
    const id = volumeTarget.current;
    if (id && id !== snapshot.volumeId) {
      chooseVolume(id);
      void runtime.selectVolume(id);
    }
    void runtime.start(false, gesture);
  }

  const [importError, setImportError] = useState<string | null>(null);
  const viewSnapshot: GameSnapshot = importError ? {
    ...snapshot, phase: 'error', error: { kind: 'runtime', message: importError },
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
    if (runtime?.getSnapshot().difficulty === value) saveSetting('difficulty', value);
  }

  function setMode(value: ExperienceMode) {
    runtime?.setMode(value);
    if (runtime?.getSnapshot().mode === value) saveSetting('mode', value);
  }

  function setDynamicLights(value: boolean) {
    runtime?.setDynamicLights(value);
    if (runtime?.getSnapshot().dynamicLights === value) saveSetting('dynamicLights', value);
  }

  function setImmersiveMouse(value: boolean) {
    runtime?.setImmersiveMouse(value);
    if (runtime?.getSnapshot().immersiveMouse === value) saveSetting('immersiveMouse', value);
  }

  function chooseOrientation(value: OrientationPreference) {
    setOrientation(value);
    saveSetting('orientation', value);
    orientationLock.current?.choose(value);
  }

  async function setQuality(value: QualityTier) {
    await runtime?.setQuality(value);
    if (runtime?.getSnapshot().quality !== value) return;
    saveSetting('quality', value);
    if (search.has('q')) {
      const params = new URLSearchParams(search);
      params.set('q', value);
      setSearch(params, { replace: true, preventScrollReset: true });
    }
  }

  function tryAgain(event?: MouseEvent<HTMLButtonElement>) {
    if (viewSnapshot.phase === 'unsupported' || viewSnapshot.phase === 'error' ||
      (viewSnapshot.phase === 'menu' && viewSnapshot.error?.kind === 'graphics')) {
      setImportError(null);
      setRuntime(null);
      setMount(value => value + 1);
    } else if (viewSnapshot.phase === 'paused') void runtime?.resume(undefined, event?.nativeEvent);
    else void runtime?.start(false, event?.nativeEvent);
  }

  async function share() {
    const url = new URL(location.pathname, location.origin).href;
    const request = ++shareRequest.current;
    try {
      await navigator.clipboard.writeText(url);
      if (request === shareRequest.current) showNotice(true);
    } catch {
      if (request === shareRequest.current) showNotice(false);
    }
  }

  async function fullscreen() {
    const element = viewport.current;
    try {
      if (!element || !fullscreenState.available) throw new Error('Fullscreen unavailable');
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else {
        await element.requestFullscreen();
        if (viewport.current === element) void orientationLock.current?.apply();
      }
    } catch {
      setFullscreenMessage('Fullscreen unavailable.');
      runtime?.showMessage('FULL SCREEN UNAVAILABLE');
    }
  }

  return (
    <main ref={viewport} className={c('viewport', orientation !== null && 'compact-touch',
      customCursor && 'custom-cursor', showcaseFlight && 'showcase-flight')}
      onPointerOver={event => {
        if (!uiCursor || !event.isTrusted || event.pointerType === 'touch') return;
        const control = (event.target as Element).closest(cueControls);
        if (control && !(event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) {
          runtime?.playUiCue('hover');
        }
      }}
      onClickCapture={event => {
        if (!uiCursor || !event.isTrusted) return;
        if ((event.target as Element).closest(cueControls)) runtime?.playUiCue('press');
        else runtime?.primeAudio();
      }}
      onKeyDownCapture={event => {
        if (uiCursor && event.isTrusted && !event.repeat && navigator.userActivation?.isActive) runtime?.primeAudio();
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
            share={() => void share()} fullscreen={fullscreen} fullscreenActive={fullscreenState.active} />
          {!showcase && <GameHUD runtime={runtime} />}
          <ResultsScreen snapshot={snapshot} restart={event => void runtime?.start(false, event.nativeEvent)} menu={returnToMenu} />
        </div>
        <div id="flash" ref={flash} />
        <div id="shade" />
        {!panel && <GameFallback snapshot={viewSnapshot} retry={tryAgain} menu={returnToMenu} settings={() => openPanel('settings')}
          startSilent={event => {
            if (snapshot.phase === 'paused') void runtime?.resume(true, event.nativeEvent);
            else void runtime?.start(true, event.nativeEvent);
          }} />}
        {panel === 'credits' && <CreditsPanel volume={snapshot.volumeId} close={() => setPanel(null)} />}
        <ShareToast notice={notice} />
      </div>
      <pre id="errbox" ref={debug} />
      {panel === 'settings' && <SettingsPanel snapshot={snapshot} close={() => setPanel(null)}
        chooseQuality={value => void setQuality(value)}
        setVolume={value => { runtime?.setVolume(value); saveSetting('volume', Math.round(value * 100)); }}
        setMuted={value => runtime?.setMuted(value)} setDynamicLights={setDynamicLights}
        immersiveMouseAvailable={immersiveMouseAvailable} setImmersiveMouse={setImmersiveMouse}
        orientation={orientation !== null ? { value: orientation, choose: chooseOrientation } : undefined}
        fullscreen={{ ...fullscreenState, toggle: () => void fullscreen(), message: fullscreenMessage }} />}
    </main>
  );
}
