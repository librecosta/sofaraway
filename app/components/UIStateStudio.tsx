import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { initialSnapshot } from '../game/contracts';
import type { GameSnapshot, VolumeId } from '../game/contracts';
import { resolveDifficulty } from '../game/core/difficulty';
import { studioGroups, studioSizes, uiStates } from '../game/debug/ui-state-catalog';
import type { UIState } from '../game/debug/ui-state-catalog';
import type { UIBackdrop } from '../game/debug/ui-backdrop.client';
import { classes as c } from '../styles/classes';
import s from '../styles/debug.module.css';
import { CreditsPanel } from './CreditsPanel';
import { GameFallback, isBlockingFallback } from './GameFallback';
import { HUDView } from './GameHUD';
import { MainMenu } from './MainMenu';
import { ShareToast, useShareToast } from './MenuUtilities';
import { ResultsScreen } from './ResultsScreen';
import { SettingsPanel } from './SettingsPanel';

const frameHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Game UI preview</title></head><body></body></html>';

export function UIStateStudio() {
  const [selected, setSelected] = useState(uiStates[0]);
  const [size, setSize] = useState(2);
  const [real, setReal] = useState(false);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState<HTMLBodyElement | null>(null);
  const [revision, reset] = useState(0);
  const [open, setOpen] = useState(true);
  const [fit, setFit] = useState(true);
  const [scale, setScale] = useState(1);
  const [width, height] = studioSizes[size];
  const viewport = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  function connect() {
    const doc = viewport.current?.contentDocument;
    if (!doc?.body || doc.URL !== 'about:srcdoc') return;
    if (!doc.head.querySelector('[data-studio-css]')) {
      for (const stylesheet of document.head.querySelectorAll('link[rel="stylesheet"],style')) {
        const copy = doc.importNode(stylesheet, true);
        copy.setAttribute('data-studio-css', '');
        doc.head.append(copy);
      }
    }
    setFrame(doc.body as HTMLBodyElement);
  }

  // The static document may finish loading before React hydrates the iframe handler.
  useEffect(() => { if (open) connect(); }, [open]);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const resize = () => setScale(fit ? Math.min(1, node.clientWidth / width, window.innerHeight * .75 / height) : 1);
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    window.addEventListener('resize', resize);
    resize();
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [open, fit, width, height]);

  return <section id="ui-states" className={s.section}>
    <h2>UI State Studio</h2>
    <p>Inspect the live interface components in a separate viewport. Preview actions stay here; game settings and scores are untouched.</p>
    <div className={s.studioTools}>
      <label>Scenario <select value={selected.id} onChange={event => {
        const item = uiStates.find(scene => scene.id === event.target.value)!;
        setSelected(item);
        if (item.size !== undefined) setSize(item.size);
        setOpen(true);
        reset(value => value + 1);
      }}>
        {studioGroups.map(group => <optgroup key={group} label={group}>
          {uiStates.filter(item => item.group === group).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </optgroup>)}
      </select></label>
      <label>Preview viewport <select value={size} onChange={event => setSize(Number(event.target.value))}>
        {studioSizes.map(([w, h], index) => <option key={w} value={index}>{w} × {h}</option>)}
      </select></label>
      <label className={s.studioCheck}><input type="checkbox" checked={real} onChange={event => {
        setReal(event.target.checked);
        setReady(false);
      }} /> Real corridor background</label>
      <label className={s.studioCheck}><input type="checkbox" checked={fit} onChange={event => setFit(event.target.checked)} /> Fit preview</label>
      <button type="button" onClick={() => reset(value => value + 1)} disabled={!open}>Replay state</button>
      <button type="button" onClick={() => { setFrame(null); setReady(false); setOpen(!open); }}>{open ? 'Close preview' : 'Open preview'}</button>
    </div>
    <dl className={s.studioMeta}>
      <div><dt>State</dt><dd>{selected.name} · {selected.group}</dd></div>
      <div><dt>Component</dt><dd>{selected.component}</dd></div>
      <div><dt>Trigger</dt><dd>{selected.trigger}</dd></div>
      <div><dt>Behavior</dt><dd>{selected.recovery}</dd></div>
      <div><dt>Background</dt><dd role="status">{real
        ? ready ? 'Rendered game corridor' : 'Static fallback while WebGL is unavailable or loading'
        : 'Static preview background'}</dd></div>
    </dl>
    {open && <div ref={stage} className={s.studioViewport}>
      <div className={s.studioSurface} style={{ width: width * scale, height: height * scale }}>
        <iframe ref={viewport} title="Game UI preview" srcDoc={frameHtml} width={width} height={height} onLoad={connect}
          style={{ transform: `scale(${scale})` }} />
      </div>
      {frame && createPortal(<StudioFrame selected={selected} revision={revision} real={real}
        onBackdrop={setReady} />, frame)}
    </div>}
  </section>;
}

function StudioFrame({ selected, revision, real, onBackdrop }: {
  selected: UIState; revision: number; real: boolean; onBackdrop(ready: boolean): void;
}) {
  const [volume, setVolume] = useState(selected.snapshot.volumeId);
  return <main className={c('viewport', 'studio-stage')}>
    <Backdrop real={real} volume={volume} onBackdrop={onBackdrop} />
    <StudioControls key={revision} selected={selected} setBackdropVolume={setVolume} />
  </main>;
}

function Backdrop({ real, volume, onBackdrop }: {
  real: boolean; volume: VolumeId; onBackdrop(value: boolean): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef(volume);
  current.current = volume;
  const preview = useRef<UIBackdrop | null>(null);
  useLayoutEffect(() => {
    if (!real || !canvas.current) return;
    const element = canvas.current;
    let stale = false;
    let resize: ResizeObserver | undefined;
    void import('../game/debug/ui-backdrop.client').then(({ UIBackdrop }) => {
      if (stale) return;
      const backdrop = preview.current = new UIBackdrop(element, onBackdrop);
      const render = () => {
        try { backdrop.render({ volumeId: current.current }); } catch { onBackdrop(false); }
      };
      resize = new ResizeObserver(render);
      resize.observe(element);
      render();
    }).catch(() => { if (!stale) onBackdrop(false); });
    return () => {
      stale = true;
      resize?.disconnect();
      preview.current?.dispose();
      preview.current = null;
    };
  }, [real, onBackdrop]);

  useEffect(() => {
    try { preview.current?.render({ volumeId: volume }); } catch { onBackdrop(false); }
  }, [volume, onBackdrop]);

  return real ? <canvas id="gl" ref={canvas} aria-hidden="true" /> : null;
}

function StudioControls({ selected, setBackdropVolume }: { selected: UIState; setBackdropVolume(volume: VolumeId): void }) {
  const [snapshot, setSnapshot] = useState(selected.snapshot);
  const [panel, setPanel] = useState<'settings' | 'credits' | null>(
    selected.overlay === 'settings' || selected.overlay === 'credits' ? selected.overlay : null);
  const host = useRef<HTMLDivElement>(null);
  const { notice, showNotice } = useShareToast();
  const visible = ['uninitialized', 'initializing', 'menu', 'starting', 'error', 'unsupported'].includes(snapshot.phase);
  const blocking = isBlockingFallback(snapshot);
  const patch = (value: Partial<GameSnapshot>) => setSnapshot(current => ({ ...current, ...value }));
  const menu = () => patch({ phase: 'menu', error: null, pauseReason: null });
  const play = () => patch({ phase: 'playing', error: null, pauseReason: null, soundUnavailable: false });
  const share = () => showNotice(selected.overlay !== 'share-failure');

  useEffect(() => {
    setBackdropVolume(selected.snapshot.volumeId);
    if (selected.overlay === 'share-success' || selected.overlay === 'share-failure') share();
    if (!selected.interaction) return;
    const timer = window.setTimeout(() => {
      host.current?.querySelector<HTMLButtonElement>(selected.interaction === 'wheel'
        ? '[data-vol-step="1"]' : '[aria-label="Next difficulty"]')?.click();
    }, 110);
    return () => window.clearTimeout(timer);
  }, [selected, setBackdropVolume]);

  return <div ref={host} id="ui" onKeyDown={event => {
    if (event.key === 'Escape' && panel) { event.preventDefault(); setPanel(null); }
  }}>
    <div inert={!!panel || blocking}>
      <MainMenu snapshot={snapshot} visible={visible} musicInitiallyOpen={selected.overlay === 'music'}
        chooseVolume={id => {
          patch({ volumeId: id, difficulty: resolveDifficulty(id, snapshot.difficulty), localRecord: initialSnapshot.localRecord });
          setBackdropVolume(id);
        }}
        chooseDifficulty={difficulty => patch({ difficulty, localRecord: initialSnapshot.localRecord })}
        chooseMode={mode => patch({ mode, localRecord: initialSnapshot.localRecord })}
        setDynamicLights={dynamicLights => patch({ dynamicLights })}
        start={play} settings={() => setPanel('settings')} credits={() => setPanel('credits')}
        share={share} fullscreen={() => patch({ message: 'FULL SCREEN UNAVAILABLE' })} />
      <HUDView snapshot={snapshot} pause={() => patch({ phase: 'paused', pauseReason: 'user' })}
        enableAudio={() => patch({ soundUnavailable: false })} />
      <ResultsScreen snapshot={snapshot} restart={play} menu={menu} />
    </div>
    <div id="shade" />
    {!panel && <GameFallback snapshot={snapshot} retry={snapshot.phase === 'paused' ? play : menu}
      startSilent={() => patch({ phase: 'playing', error: null, pauseReason: null, soundUnavailable: true })}
      menu={menu} settings={() => setPanel('settings')} preview />}
    {panel === 'credits' && <CreditsPanel volume={snapshot.volumeId} close={() => setPanel(null)} preview />}
    {panel === 'settings' && <SettingsPanel snapshot={snapshot} close={() => setPanel(null)}
      chooseQuality={quality => patch({ quality })} setVolume={volume => patch({ volume })}
      setMuted={muted => patch({ muted })} setDynamicLights={dynamicLights => patch({ dynamicLights })} preview />}
    <ShareToast notice={notice} />
  </div>;
}
