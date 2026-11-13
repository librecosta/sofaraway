import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';
import { initialSnapshot } from '../game/contracts';
import type { Difficulty, GameRuntime, GameSnapshot, PlayMode, QualityTier, VolumeId } from '../game/contracts';
import { volumeById } from '../game/core/volumes';
import type { Runtime } from '../game/runtime/GameRuntime.client';
import { readOptions, saveSetting } from '../game/runtime/settings.client';
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
const menuFields = ['phase', 'volumeId', 'difficulty', 'mode', 'quality', 'volume', 'muted', 'error', 'pauseReason', 'result',
  'localRecord', 'newBest', 'message', 'dynamicLights'] as const;

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
  const requested = volumeById(search.get('vol')).id;
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [mount, setMount] = useState(0);
  const [panel, setPanel] = useState<'settings' | 'credits' | null>(null);
  const [hideUi, setHideUi] = useState(false);
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
  const startTarget = useRef<VolumeId | null>(null);
  const keys = useRef<(key: string, event: KeyboardEvent) => boolean>(() => false);

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
      if (snapshot.phase === 'menu' && !snapshot.error && !event.repeat && (key === ' ' || key === 'enter') &&
        !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        startSelected();
        return true;
      }
      return false;
    };
  });

  useEffect(() => () => { shareRequest.current++; }, []);

  useEffect(() => {
    const element = host.current!;
    const canvas = document.createElement('canvas');
    canvas.id = 'gl';
    canvas.setAttribute('aria-label', 'SoFaraway game viewport');
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
          cursor.current.className = c(!state.visible && 'hidden', state.hover && 'hover', state.down && 'down', state.locked && 'lock');
        },
        flash(opacity, color) {
          if (!flash.current) return;
          flash.current.style.backgroundColor = color;
          flash.current.style.opacity = String(opacity);
        },
        debug(text) { if (debug.current) debug.current.textContent = text; },
        key: (key, event) => keys.current(key, event),
        muted: value => saveSetting('muted', value),
      });
      setRuntime(engine);
      return engine.initialize(canvas, { ...options, saveRecords: true });
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
    if (!runtime || requested === snapshot.volumeId || snapshot.error?.kind === 'graphics' ||
      ['uninitialized', 'initializing', 'unsupported', 'error', 'disposed'].includes(snapshot.phase)) return;
    if (snapshot.phase !== 'menu' && snapshot.phase !== 'results') runtime.returnToMenu();
    void runtime.selectVolume(requested).then(() => {
      if (startTarget.current !== requested) return;
      startTarget.current = null;
      const loaded = runtime.getSnapshot();
      if (loaded.phase === 'menu' && loaded.volumeId === requested) void runtime.start();
    });
  }, [runtime, requested, snapshot.volumeId, snapshot.phase, snapshot.error]);

  function startSelected() {
    if (!runtime || snapshot.phase !== 'menu' || snapshot.error) return;
    const id = volumeTarget.current;
    if (id && id !== snapshot.volumeId) {
      startTarget.current = id;
      chooseVolume(id);
    } else void runtime.start();
  }

  const [importError, setImportError] = useState<string | null>(null);
  const viewSnapshot: GameSnapshot = importError ? {
    ...snapshot, phase: 'error', error: { kind: 'runtime', message: importError },
  } : snapshot;
  const menuVisible = ['uninitialized', 'initializing', 'menu', 'starting', 'unsupported', 'error'].includes(viewSnapshot.phase);
  const modalOpen = !!panel || isBlockingFallback(viewSnapshot);
  const customCursor = viewSnapshot.phase === 'playing' && !modalOpen;
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

  function setMode(value: PlayMode) {
    runtime?.setMode(value);
    if (runtime?.getSnapshot().mode === value) saveSetting('mode', value);
  }

  function setDynamicLights(value: boolean) {
    runtime?.setDynamicLights(value);
    if (runtime?.getSnapshot().dynamicLights === value) saveSetting('dynamicLights', value);
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

  function tryAgain() {
    if (viewSnapshot.phase === 'unsupported' || viewSnapshot.phase === 'error' ||
      (viewSnapshot.phase === 'menu' && viewSnapshot.error?.kind === 'graphics')) {
      setImportError(null);
      setRuntime(null);
      setMount(value => value + 1);
    } else if (viewSnapshot.phase === 'paused') void runtime?.resume();
    else void runtime?.start();
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
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      runtime?.showMessage('FULL SCREEN UNAVAILABLE');
    }
  }

  return (
    <main ref={viewport} className={c('viewport', customCursor && 'custom-cursor')}>
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
            setDynamicLights={setDynamicLights} onVolumeTarget={id => { volumeTarget.current = id; }}
            start={startSelected} settings={() => openPanel('settings')} credits={() => openPanel('credits')}
            share={() => void share()} fullscreen={fullscreen} />
          <GameHUD runtime={runtime} />
          <ResultsScreen snapshot={snapshot} restart={() => void runtime?.start()} menu={returnToMenu} />
        </div>
        <div id="flash" ref={flash} />
        <div id="shade" />
        {!panel && <GameFallback snapshot={viewSnapshot} retry={tryAgain} menu={returnToMenu} settings={() => openPanel('settings')}
          startSilent={() => { if (snapshot.phase === 'paused') void runtime?.resume(true); else void runtime?.start(true); }} />}
        {panel === 'credits' && <CreditsPanel volume={snapshot.volumeId} close={() => setPanel(null)} />}
        <ShareToast notice={notice} />
      </div>
      <pre id="errbox" ref={debug} />
      {panel === 'settings' && <SettingsPanel snapshot={snapshot} close={() => setPanel(null)}
        chooseQuality={value => void setQuality(value)}
        setVolume={value => { runtime?.setVolume(value); saveSetting('volume', Math.round(value * 100)); }}
        setMuted={value => runtime?.setMuted(value)} setDynamicLights={setDynamicLights} />}
    </main>
  );
}
