import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';
import { initialSnapshot } from '../game/contracts';
import type { Difficulty, GameRuntime, GameSnapshot, QualityTier } from '../game/contracts';
import { volumeById, VOLUMES } from '../game/core/volumes';
import type { Runtime } from '../game/runtime/GameRuntime.client';
import { readOptions, saveSetting } from '../game/runtime/settings.client';
import { classes as c } from '../styles/classes';
import { GameFallback } from './GameFallback';
import { GameHUD } from './GameHUD';
import { MainMenu } from './MainMenu';
import { ResultsScreen } from './ResultsScreen';
import { SettingsPanel } from './SettingsPanel';

const noSubscribe = () => () => {};
const getInitialSnapshot = () => initialSnapshot;
const menuFields = ['phase', 'volumeId', 'difficulty', 'quality', 'volume', 'muted', 'error', 'pauseReason', 'result', 'message'] as const;

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
  const snapshot = useMenuSnapshot(runtime);
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const debug = useRef<HTMLPreElement>(null);
  const panelReturnFocus = useRef<HTMLElement | null>(null);
  const keys = useRef<(key: string, event: KeyboardEvent) => boolean>(() => false);

  function stepVolume(direction: number) {
    const index = VOLUMES.findIndex(volume => volume.id === snapshot.volumeId);
    const next = VOLUMES[(index + direction + VOLUMES.length) % VOLUMES.length];
    const params = new URLSearchParams(search);
    params.set('vol', next.id);
    setSearch(params, { preventScrollReset: true });
  }

  function openPanel(value: 'settings' | 'credits') {
    const focused = document.activeElement;
    panelReturnFocus.current = focused instanceof HTMLElement && focused !== document.body
      ? focused : viewport.current?.querySelector<HTMLElement>(`[data-act=${value}]`) ?? null;
    setPanel(value);
  }

  useEffect(() => {
    if (panel) {
      viewport.current?.querySelector<HTMLElement>('[role="dialog"] button:not(:disabled)')?.focus();
    } else {
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
      if (snapshot.phase === 'menu' && (key === 'arrowleft' || key === 'arrowright')) {
        event.preventDefault();
        if (!event.repeat) stepVolume(key === 'arrowright' ? 1 : -1);
        return true;
      }
      return false;
    };
  });

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
        shake(x, y) {
          if (viewport.current) viewport.current.style.transform = x || y ? `translate(${x}px,${y}px)` : '';
        },
        debug(text) { if (debug.current) debug.current.textContent = text; },
        key: (key, event) => keys.current(key, event),
        best: score => saveSetting('best', score),
        muted: value => saveSetting('muted', value),
      });
      setRuntime(engine);
      return engine.initialize(canvas, options);
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
    void runtime.selectVolume(requested);
  }, [runtime, requested, snapshot.volumeId, snapshot.phase, snapshot.error]);

  const [importError, setImportError] = useState<string | null>(null);
  const viewSnapshot: GameSnapshot = importError ? {
    ...snapshot, phase: 'error', error: { kind: 'runtime', message: importError },
  } : snapshot;
  const menuVisible = ['uninitialized', 'initializing', 'menu', 'starting', 'unsupported', 'error'].includes(viewSnapshot.phase);
  const modalOpen = !!panel || !!viewSnapshot.error || viewSnapshot.phase === 'paused';
  const customCursor = !['uninitialized', 'initializing', 'unsupported', 'error', 'disposed'].includes(viewSnapshot.phase)
    && viewSnapshot.error?.kind !== 'graphics';
  const returnToMenu = () => runtime?.returnToMenu();

  function setDifficulty(value: Difficulty) {
    runtime?.setDifficulty(value);
    if (runtime?.getSnapshot().difficulty === value) saveSetting('difficulty', value);
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
    try {
      await navigator.clipboard.writeText(url);
      runtime?.showMessage('LINK COPIED');
    } catch {
      runtime?.showMessage(url);
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
    <main ref={viewport} className={c(customCursor && 'custom-cursor')}>
      <div ref={host} />
      <div id="cursor" ref={cursor} aria-hidden="true" hidden={!customCursor}>
        <span className={c('c-ring')} />
        <span className={c('c-tick', 't')} /><span className={c('c-tick', 'b')} />
        <span className={c('c-tick', 'l')} /><span className={c('c-tick', 'r')} />
        <span className={c('c-dot')} />
      </div>
      <div id="ui" style={{ display: hideUi ? 'none' : undefined }}>
        <div className={c('frame')} aria-hidden="true">
          <i className={c('fc', 'tl')} /><i className={c('fc', 'tr')} />
          <i className={c('fc', 'bl')} /><i className={c('fc', 'br')} />
        </div>
        <div inert={modalOpen}>
          <MainMenu snapshot={viewSnapshot} visible={menuVisible} chooseDifficulty={setDifficulty} stepVolume={stepVolume}
            start={() => void runtime?.start()} settings={() => openPanel('settings')} credits={() => openPanel('credits')}
            share={() => void share()} fullscreen={fullscreen} />
          <GameHUD runtime={runtime} />
          <ResultsScreen snapshot={snapshot} restart={() => void runtime?.start()} menu={returnToMenu} />
        </div>
        <div id="flash" ref={flash} />
        <div id="shade" />
        {!panel && <GameFallback snapshot={viewSnapshot} retry={tryAgain} menu={returnToMenu} settings={() => openPanel('settings')}
          startSilent={() => { if (snapshot.phase === 'paused') void runtime?.resume(true); else void runtime?.start(true); }} />}
        {panel === 'credits' && (
          <section id="panel" className={c('modal')} role="dialog" aria-label="Credits" aria-modal="true">
            <div className={c('modal-inner')}>
              <div className={c('eyebrow')}><i /><span>CREDITS</span><i /></div>
              <div id="panel-body">
                <b>SoFaraway</b> — a browser rhythm runner.<br />
                Thread the gates, ride the beat.<br /><br />
                Made by <b>librecosta</b>.<br />
                Built with three.js r187 on WebGL2.<br />
                Every material, shader, texture and note is generated at runtime.<br /><br />
                <b>INSPIRATION</b><br />
                Mechanism inspired by HelloRun (HelloEnjoy, 2013).
              </div>
              <button className={c('btn', 'tiny')} data-act="closepanel" onClick={() => setPanel(null)}><span>CLOSE</span></button>
            </div>
          </section>
        )}
      </div>
      <pre id="errbox" ref={debug} />
      {panel === 'settings' && <SettingsPanel snapshot={snapshot} close={() => setPanel(null)}
        chooseQuality={value => void setQuality(value)}
        setVolume={value => { runtime?.setVolume(value); saveSetting('volume', Math.round(value * 100)); }}
        setMuted={value => runtime?.setMuted(value)} />}
    </main>
  );
}
