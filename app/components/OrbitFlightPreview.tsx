import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { QualityTier } from '../game/contracts';
import { steer, steeringDamping } from '../game/core/input';
import { ORBIT_LENGTH, orbitPreview, orbitViews } from '../game/core/orbit-field';
import type { OrbitDensity } from '../game/core/orbit-field';
import type { Graphics } from '../game/graphics/scene.client';
import s from '../styles/orbit-preview.module.css';

type Metrics = ReturnType<Graphics['metrics']>;
type Viewer = { redraw(resetView?: boolean): void; reload(): void; quality(): void };
const qualities = ['low', 'auto', 'high'] as const;
const densities = ['flight', 'sparse', 'dense'] as const;
const limitStation = (station: number) => Math.max(0, Math.min(ORBIT_LENGTH, station));
const limitSeed = (seed: number) => Number.isFinite(seed) ? Math.max(0, Math.min(0xffffffff, Math.trunc(seed))) : orbitPreview.seed;

export function OrbitFlightPreview({ embedded = false }: { embedded?: boolean }) {
  const [params] = useSearchParams();
  const requestedQuality = params.get('q') as QualityTier;
  const requestedDensity = params.get('density') as OrbitDensity;
  const [quality, setQuality] = useState<QualityTier>(qualities.includes(requestedQuality) ? requestedQuality : 'auto');
  const [density, setDensity] = useState<OrbitDensity>(densities.includes(requestedDensity) ? requestedDensity : 'flight');
  const [seed, setSeed] = useState(limitSeed(Number(params.get('seed') ?? orbitPreview.seed)));
  const [seedDraft, setSeedDraft] = useState(String(seed));
  const [station, setStation] = useState(limitStation(Number(params.get('station')) || 0));
  const [playing, setPlaying] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>();
  const [status, setStatus] = useState('Loading WebGL preview…');
  const [opened, setOpened] = useState(!embedded);
  const [readyToOpen, setReadyToOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer>(null);
  const settings = useRef({ seed, density, quality, station, playing, post: params.get('post') !== '0', auto: !params.has('station') });

  useEffect(() => { if (embedded) setReadyToOpen(true); }, [embedded]);

  useEffect(() => {
    if (!opened || !canvas.current) return;
    const element = canvas.current;
    const controls = settings.current;
    const events = new AbortController();
    const { signal } = events;
    let cleanup: (() => void) | undefined;
    void Promise.all([
      import('../game/graphics/scene.client'),
      import('../game/graphics/orbit-world.client'),
      import('../game/runtime/input.client'),
    ]).then(([{ Graphics }, { buildOrbitPath }, { InputController }]) => {
      if (signal.aborted) return;
      const path = buildOrbitPath();
      const mobile = matchMedia('(pointer: coarse)').matches;
      const graphics = new Graphics(element, controls.quality, mobile, {
        fixedTime: null, autoplay: false, god: false, align: false, boost: false,
        mobileQuality: false, post: controls.post, debug: false, record: false,
      });
      cleanup = () => graphics.dispose();
      graphics.loadOrbit(path, controls.seed, controls.density);
      let frame = 0;
      let dirty = true;
      let lost = false;
      let last = 0;
      let reportAt = -Infinity;
      let time = 0;
      let speed = 52;
      let x = 0, y = 0, targetX = 0, targetY = 0;
      const active = () => !embedded || !!element.closest('#orbit')?.contains(document.activeElement);
      const requestDraw = () => {
        if (!lost && !frame) frame = requestAnimationFrame(draw);
      };
      const invalidate = () => {
        dirty = true;
        requestDraw();
      };
      const toggle = (value: boolean) => {
        controls.playing = value;
        setPlaying(value);
        invalidate();
      };
      const input = new InputController(element, () => active() && controls.playing, (key, event) => {
        if (key !== 'escape' || !active() || !controls.playing) return false;
        event.preventDefault();
        toggle(false);
        input.clear();
        return true;
      });
      const resize = () => {
        const { clientWidth, clientHeight } = element;
        graphics.resize(clientWidth, clientHeight, window.devicePixelRatio);
        invalidate();
      };
      const observer = new ResizeObserver(resize);
      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        input.dispose();
        viewer.current = null;
        graphics.dispose();
      };
      observer.observe(element);
      window.addEventListener('resize', resize, { signal });
      document.addEventListener('visibilitychange', () => {
        last = 0;
        input.clear();
        if (!document.hidden && controls.playing) requestDraw();
      }, { signal });
      element.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        lost = true;
        cancelAnimationFrame(frame);
        frame = 0;
        input.clear();
        toggle(false);
        graphics.releaseSurface();
        setStatus('Graphics paused. Waiting for WebGL recovery…');
      }, { signal });
      element.addEventListener('webglcontextrestored', () => {
        try {
          graphics.restoreOrbit(path, controls.seed, controls.density, controls.quality);
          lost = false;
          last = 0;
          resize();
          setStatus('');
        } catch {
          setStatus('WebGL recovery failed. Reopen the preview to retry.');
        }
      }, { signal });
      viewer.current = {
        redraw(resetView) {
          if (resetView) {
            time = x = y = targetX = targetY = 0;
            speed = 52;
            input.clear();
          }
          invalidate();
        },
        reload() {
          if (lost) return;
          graphics.loadOrbit(path, controls.seed, controls.density);
          invalidate();
        },
        quality() {
          if (lost) return;
          graphics.configure(controls.quality, mobile);
          resize();
        },
      };

      function draw(now: number) {
        frame = 0;
        const flying = controls.playing && !document.hidden;
        const dt = flying && last ? Math.min(.05, (now - last) / 1000) : 0;
        last = flying ? now : 0;
        if (!lost && (dirty || flying)) {
          try {
            const controlsFrame = input.read();
            const boosting = flying && active() && controlsFrame.boosting;
            if (flying) {
              if (active()) [targetX, targetY] = steer(controlsFrame, targetX, targetY, dt);
              const damping = steeringDamping(dt);
              x += (targetX - x) * damping;
              y += (targetY - y) * damping;
              speed += ((boosting ? 94 : 52) - speed) * Math.min(1, dt * 5);
              controls.station = limitStation(controls.station + dt * speed);
              time += dt;
              if (controls.station >= path.length) toggle(false);
            }
            graphics.drawOrbit({ station: controls.station, x, y, time });
            if (dirty || !controls.playing || now - reportAt > 230) {
              setMetrics(graphics.metrics());
              setStation(controls.station);
              reportAt = now;
            }
            dirty = false;
          } catch (error) {
            toggle(false);
            setStatus(error instanceof Error ? error.message : 'Could not render the flight preview.');
            return;
          }
        }
        if (controls.playing && !document.hidden) requestDraw();
      }
      resize();
      setStatus('');
      if (!embedded && controls.auto && !matchMedia('(prefers-reduced-motion: reduce)').matches) toggle(true);
    }).catch(error => {
      cleanup?.();
      cleanup = undefined;
      if (!signal.aborted) setStatus(error instanceof Error ? error.message : 'Could not start the flight preview.');
    });
    return () => { events.abort(); cleanup?.(); };
  }, [embedded, opened]);

  function seek(next: number) {
    settings.current.station = limitStation(next);
    setStation(settings.current.station);
    viewer.current?.redraw(true);
  }

  function toggle() {
    if (!playing && settings.current.station >= ORBIT_LENGTH) seek(0);
    settings.current.playing = !playing;
    setPlaying(!playing);
    viewer.current?.redraw();
  }

  function switchDensity(next: OrbitDensity) {
    if (next === settings.current.density) return;
    settings.current.density = next;
    setDensity(next);
    viewer.current?.reload();
  }

  function applySeed() {
    const value = limitSeed(seedDraft.trim() ? Number(seedDraft) : seed);
    setSeedDraft(String(value));
    if (value === settings.current.seed) return;
    settings.current.seed = value;
    setSeed(value);
    viewer.current?.reload();
  }

  function preset(value: 'Sparse' | 'Dense') {
    settings.current.playing = false;
    setPlaying(false);
    seek(orbitViews[value]);
    switchDensity(value === 'Sparse' ? 'sparse' : 'dense');
  }

  const body = <>
    <header className={s.header}>
      <div><p>ORBIT / VOL. IV · DEVELOPMENT PREVIEW</p>{embedded ? <h2>ASTRAL BELT</h2> : <h1>ASTRAL BELT</h1>}</div>
      {!embedded && <nav aria-label="Preview navigation"><Link to="/">Game menu</Link><Link to="/debug/#orbit">Debug</Link></nav>}
    </header>
    {opened ? <>
      <div className={s.view}><canvas ref={canvas} tabIndex={0} aria-label="ASTRAL BELT flight" />
        {status && <p role="status" className={s.status}>{status}</p>}
      </div>
      <div className={s.controls}>
        <div className={s.actions}>
          <button type="button" onClick={toggle} disabled={!!status}>{playing ? 'Pause flight' : 'Fly'}</button>
          <button type="button" onClick={() => preset('Sparse')}>Sparse view</button>
          <button type="button" onClick={() => preset('Dense')}>Dense view</button>
        </div>
        <div className={s.seek}><span>World station</span><output aria-live="off">{station.toFixed(1)}</output>
          <input aria-label="World station" type="range" min="0" max={ORBIT_LENGTH} step="1" value={Math.round(station)}
            onChange={e => seek(Number(e.currentTarget.value))} />
        </div>
        <div className={s.actions}>
          <label>Density <select value={density} onChange={e => switchDensity(e.currentTarget.value as OrbitDensity)}>
            <option value="flight">Flight progression</option><option value="sparse">Sparse</option><option value="dense">Dense</option>
          </select></label>
          <label>Seed <input type="number" min="0" max="4294967295" value={seedDraft}
            onChange={e => setSeedDraft(e.currentTarget.value)} onBlur={applySeed} onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }} /></label>
          <label>Quality <select value={quality} onChange={e => {
            const value = e.currentTarget.value as QualityTier;
            settings.current.quality = value;
            setQuality(value);
            viewer.current?.quality();
          }}>{qualities.map(value => <option key={value} value={value}>{value === 'auto' ? 'Auto' : value === 'low' ? 'Low' : 'High'}</option>)}</select></label>
        </div>
        <p>Steer with mouse, touch or arrow keys. Hold Shift to boost.</p>
        {metrics?.orbit && <output aria-live="off" className={s.metrics} data-orbit-metrics={JSON.stringify(metrics)}>
          {metrics.calls} draw calls · {metrics.triangles.toLocaleString('en-US')} triangles · {metrics.orbit.instances} instances ·{' '}
          {metrics.orbit.visibleChunks}/{metrics.orbit.chunks} chunks · {metrics.orbit.descriptions} rock descriptions · LOD {metrics.orbit.lod.join(' / ')}
        </output>}
      </div>
    </> : <button type="button" className={s.open} disabled={!readyToOpen} onClick={() => setOpened(true)}>Open flight preview</button>}
  </>;
  return embedded ? <section id="orbit" className={s.embedded}>{body}</section> : <main className={s.page}>{body}</main>;
}
