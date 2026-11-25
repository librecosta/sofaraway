import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { QualityTier } from '../game/contracts';
import { steer, steeringDamping } from '../game/core/input';
import { ORBIT_WORLD_SEED } from '../game/core/orbit-field';
import { corridorLength } from '../game/core/corridor-composition';
import { referenceFor, START_DISTANCE } from '../game/core/reference-track';
import { orbitSceneBeats, orbitSceneNames } from '../game/core/orbit-setpieces';
import type { AphelionFocus } from '../game/core/orbit-setpieces';
import { auroraViews } from '../game/core/orbit-nebula-structure';
import { orbitLightScenes } from '../game/core/orbit-lighting';
import { sectionAt, volumeById } from '../game/core/volumes';
import { previewGameHref, previewNumber, previewQuality, stationBeat } from '../game/debug/explorer-scene';
import type { OrbitDensity } from '../game/core/orbit-field';
import type { Graphics } from '../game/graphics/scene.client';
import { SceneControls, SceneGroup, SceneQuality, SceneViewport, type LabMode } from './explorer/LiveScene';
import s from '../styles/explorer-lab.module.css';

type Metrics = ReturnType<Graphics['metrics']>;
type Viewer = { redraw(resetView?: boolean): void; reload(): void; quality(): void;
  music(play: boolean, beat?: number): void };
const densities = ['flight', 'sparse', 'dense'] as const;
const orbit = volumeById('orbit');
const length = corridorLength(orbit);
const reference = referenceFor(orbit);
const views = { Sparse: reference.station(8, 'standard'), Dense: reference.station(226, 'standard') };
const limitStation = (station: number) => Math.max(START_DISTANCE, Math.min(length, station));
const limitSeed = (seed: number) => Number.isFinite(seed) ? Math.max(0, Math.min(0xffffffff, Math.trunc(seed))) : ORBIT_WORLD_SEED;

export function OrbitFlightPreview({ lab }: { lab: LabMode }) {
  const [params] = useSearchParams();
  const requestedDensity = params.get('density') as OrbitDensity;
  const [quality, setQuality] = useState<QualityTier>(previewQuality(params));
  const [density, setDensity] = useState<OrbitDensity>(densities.includes(requestedDensity) ? requestedDensity : 'flight');
  const [seed, setSeed] = useState(Math.trunc(previewNumber(params, 'seed', ORBIT_WORLD_SEED, 0, 0xffffffff)));
  const [seedDraft, setSeedDraft] = useState(String(seed));
  const [station, setStation] = useState(previewNumber(params, 'station', START_DISTANCE, START_DISTANCE, length));
  const [playing, setPlaying] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicBeat, setMusicBeat] = useState(previewNumber(params, 'beat', 0, 0, orbit.beats));
  const [dynamicLights, setDynamicLights] = useState(params.get('lights') !== 'false');
  const [reducedMotion, setReducedMotion] = useState(params.get('reduce') === 'true');
  const [nebulaInspection, setNebulaInspection] = useState(Math.trunc(previewNumber(params, 'aurora', 0, 0, auroraViews.length - 1)));
  const requestedFocus = params.get('view');
  const [aphelionFocus, setAphelionFocus] = useState<AphelionFocus | undefined>(requestedFocus === 'planet' || requestedFocus === 'moon' ? requestedFocus : undefined);
  const [metrics, setMetrics] = useState<Metrics>();
  const [status, setStatus] = useState('Loading WebGL preview…');
  const [soundStatus, setSoundStatus] = useState('');
  const [opened, setOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer>(null);
  const settings = useRef({ seed, density, quality, station, playing, musicPlaying, musicBeat, dynamicLights,
    reducedMotion, nebulaInspection, aphelionFocus, post: params.get('post') !== '0' });

  useEffect(() => {
    if (!opened || !canvas.current) return;
    const element = canvas.current;
    const controls = settings.current;
    const events = new AbortController();
    const { signal } = events;
    let cleanup: (() => void) | undefined;
    const close = () => {
      events.abort();
      const release = cleanup;
      cleanup = undefined;
      release?.();
    };
    void Promise.all([
      import('../game/debug/preview-surface.client'),
      import('../game/runtime/input.client'),
      import('../game/audio/transport.client'),
      import('../game/graphics/path'),
    ]).then(([{ PreviewSurface }, { InputController }, { AudioTransport }, { buildRunPath }]) => {
      if (signal.aborted) return;
      const path = buildRunPath(orbit);
      const mobile = matchMedia('(pointer: coarse)').matches;
      const surface = new PreviewSurface(element, controls.quality, mobile, {
        fixedTime: null, autoplay: false, god: false, align: false, boost: false,
        mobileQuality: false, post: controls.post, debug: false, record: false,
      });
      const { graphics } = surface;
      let frame = 0;
      let releaseControls: (() => void) | undefined;
      cleanup = () => {
        cancelAnimationFrame(frame);
        viewer.current = null;
        try { releaseControls?.(); } finally { surface.dispose(); }
      };
      surface.initialize(() => graphics.loadOrbit(path, controls.seed, controls.density));
      let dirty = true;
      let last = 0;
      let reportAt = -Infinity;
      let time = 0;
      let musicRequest = 0;
      let speed = 52;
      let x = 0, y = 0, targetX = 0, targetY = 0;
      const active = () => !!element.closest('#orbit')?.contains(document.activeElement);
      const motion = matchMedia('(prefers-reduced-motion: reduce)');
      const requestDraw = () => {
        if (!surface.unavailable && !frame) frame = requestAnimationFrame(draw);
      };
      const invalidate = () => {
        dirty = true;
        requestDraw();
      };
      const pauseMusic = () => {
        musicRequest++;
        const time = audio.time;
        if (controls.musicPlaying && typeof time === 'number') controls.musicBeat = Math.min(384,time*orbit.bpm/60);
        audio.stop(true);
        controls.musicPlaying = false;
        setMusicPlaying(false);
        setMusicBeat(controls.musicBeat);
        invalidate();
      };
      const audio = new AudioTransport(pauseMusic);
      releaseControls = () => audio.dispose();
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
      releaseControls = () => { try { input.dispose(); } finally { audio.dispose(); } };
      const resize = () => {
        const { clientWidth, clientHeight } = element;
        graphics.resize(clientWidth, clientHeight, window.devicePixelRatio);
        invalidate();
      };
      const failed = () => {
        delete element.dataset.ready;
        close();
        setStatus('Could not restore the preview.');
      };
      surface.observe({ resize,
        lost: () => {
          delete element.dataset.ready;
          cancelAnimationFrame(frame);
          frame = 0;
          input.clear();
          pauseMusic();
          toggle(false);
          graphics.releaseSurface();
          setStatus('Graphics paused. Waiting for WebGL recovery…');
        },
        restore: () => {
          graphics.restoreOrbit(path, controls.seed, controls.density, controls.quality);
          last = 0;
          resize();
        },
        failed,
      });
      window.addEventListener('resize', () => {
        if (surface.unavailable) return;
        try { resize(); } catch { failed(); }
      }, { signal });
      motion.addEventListener('change', invalidate, { signal });
      document.addEventListener('visibilitychange', () => {
        last = 0;
        input.clear();
        if (document.hidden) pauseMusic();
        if (!document.hidden && controls.playing) requestDraw();
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
          if (surface.unavailable) return;
          try {
            graphics.loadOrbit(path, controls.seed, controls.density);
            invalidate();
          } catch { failed(); }
        },
        quality() {
          if (surface.unavailable) return;
          try {
            graphics.configure(controls.quality, mobile);
            resize();
          } catch { failed(); }
        },
        music(play, beat) {
          if (beat !== undefined) {
            controls.musicBeat = Math.max(0,Math.min(384,beat));
            setMusicBeat(controls.musicBeat);
          }
          if (!play || surface.unavailable) { if (beat !== undefined) audio.stop(); pauseMusic(); return; }
          setSoundStatus('');
          if (controls.musicBeat >= 384) controls.musicBeat = 0;
          controls.musicPlaying = true;
          setMusicPlaying(true);
          const request = ++musicRequest;
          void audio.start(orbit,controls.musicBeat*60/orbit.bpm).catch(() => false).then(ok=>{
            if (signal.aborted || request !== musicRequest) return;
            if (!ok) {
              pauseMusic();
              setSoundStatus('Sound could not start. You can still inspect the lighting by beat.');
            }
            invalidate();
          });
        },
      };

      function draw(now: number) {
        frame = 0;
        const flying = controls.playing && !document.hidden;
        const sounding = controls.musicPlaying && !document.hidden;
        const dt = flying && last ? Math.min(.05, (now - last) / 1000) : 0;
        last = flying ? now : 0;
        if (!surface.unavailable && (dirty || flying || sounding)) {
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
            if (sounding) {
              const at = audio.outputTimeAt(now/1000) ?? audio.time;
              if (typeof at === 'number') controls.musicBeat = Math.min(384,Math.max(0,at*orbit.bpm/60));
              if (controls.musicBeat >= 384) {
                controls.musicPlaying = false;setMusicPlaying(false);audio.finish();
              }
            }
            graphics.drawOrbit({ station: controls.station, x, y, time, nebulaInspection: controls.nebulaInspection,
              aphelionFocus: controls.aphelionFocus,
              lighting: { beat: controls.musicBeat, amount: Number(controls.dynamicLights), reducedMotion: controls.reducedMotion || motion.matches } });
            if (!element.dataset.ready) setStatus('');
            Object.assign(element.dataset, { volume: orbit.id, station: controls.station.toFixed(3),
              lightBeat: controls.musicBeat.toFixed(3), quality: controls.quality, ready: 'true',
              reducedMotion: String(controls.reducedMotion || motion.matches) });
            if (dirty || !(controls.playing || controls.musicPlaying) || now - reportAt > 230) {
              setMetrics(graphics.metrics());
              setStation(controls.station);
              setMusicBeat(controls.musicBeat);
              reportAt = now;
            }
            dirty = false;
          } catch {
            toggle(false);
            pauseMusic();
            close();
            delete element.dataset.ready;
            setStatus('Could not render the flight preview.');
            return;
          }
        }
        if ((controls.playing || controls.musicPlaying) && !document.hidden) requestDraw();
      }
      surface.initialize(resize);
    }).catch(() => {
      if (signal.aborted) return;
      close();
      setStatus('Could not open the flight preview. A working WebGL2 renderer is required.');
    });
    return close;
  }, [opened, attempt]);

  function seek(next: number) {
    settings.current.station = limitStation(next);
    setStation(settings.current.station);
    viewer.current?.redraw(true);
  }

  function toggle() {
    if (!playing) setFocus();
    if (!playing && settings.current.station >= length) seek(START_DISTANCE);
    settings.current.playing = !playing;
    setPlaying(!playing);
    viewer.current?.redraw();
  }

  function setFocus(focus?: AphelionFocus) {
    settings.current.aphelionFocus = focus;
    setAphelionFocus(focus);
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
    setFocus();
    seek(views[value]);
    switchDensity(value === 'Sparse' ? 'sparse' : 'dense');
  }

  function reset() {
    const controls = settings.current;
    controls.playing = false;
    controls.dynamicLights = true;
    controls.reducedMotion = false;
    controls.nebulaInspection = 0;
    controls.quality = 'auto';
    setPlaying(false);
    setDynamicLights(true);
    setReducedMotion(false);
    setNebulaInspection(0);
    setQuality('auto');
    setFocus();
    seek(START_DISTANCE);
    viewer.current?.music(false, 0);
    if (controls.seed !== ORBIT_WORLD_SEED || controls.density !== 'flight') {
      controls.seed = ORBIT_WORLD_SEED;
      controls.density = 'flight';
      setSeed(ORBIT_WORLD_SEED);
      setSeedDraft(String(ORBIT_WORLD_SEED));
      setDensity('flight');
      viewer.current?.reload();
    }
    viewer.current?.quality();
  }

  const snapshot = new URLSearchParams({ vol: orbit.id, station: station.toFixed(3), beat: musicBeat.toFixed(3),
    q: quality, seed: String(seed), density, view: aphelionFocus ?? 'course', aurora: String(nebulaInspection),
    lights: String(dynamicLights), reduce: String(reducedMotion), post: settings.current.post ? '1' : '0' });
  const worldBeat = stationBeat(orbit, station);
  const chapter = sectionAt(orbit, Math.min(orbit.beats - .001, worldBeat))!;
  return <section id="orbit" className={s.preview}>
    <SceneViewport volume="orbit" label="ASTRAL BELT flight" canvas={canvas} open={opened} status={status} steerable
      id={lab === 'lighting' ? 'beat-inspection' : undefined}
      onOpen={() => {
        if (canvas.current) delete canvas.current.dataset.ready;
        setOpened(true); setStatus('Loading WebGL preview…'); setAttempt(next => next + 1);
      }} />
    {opened && <SceneControls>
        <SceneGroup title={`Scene / ${chapter.name}`}>
        <div className={s.actions} aria-label="Cosmic setpieces">
          {orbit.sections.map((section,index)=><button type="button" key={section.name} title={orbitSceneNames[index]}
            aria-pressed={section.name === chapter.name}
            onClick={()=>{settings.current.playing=false;setPlaying(false);setFocus();switchDensity('flight');seek(reference.station(orbitSceneBeats[index],'standard'));
              if (lab === 'worlds') viewer.current?.music(false, orbitSceneBeats[index]);
            }}>{section.name}</button>)}
        </div>
        <label>World station<input aria-label="World station" type="range" min={START_DISTANCE} max={length} step="any" value={station}
          onChange={e => { settings.current.playing = false; setPlaying(false); seek(e.currentTarget.valueAsNumber); }} />
          <span>{station.toFixed(1)} world units</span>
        </label>
        <div className={s.actions}>
          <button type="button" onClick={toggle} disabled={!!status}>{playing ? 'Pause flight' : 'Fly'}</button>
          <button type="button" onClick={reset}>Reset</button>
          <a href={previewGameHref('orbit', worldBeat * 60 / orbit.bpm, quality, dynamicLights)}>Open in game</a>
          <a href={`/debug/${lab}/?${snapshot}`}>Link to this view</a>
        </div>
        </SceneGroup>
        <SceneGroup title="Camera and density">
        <div className={s.actions}>
          <button type="button" onClick={() => preset('Sparse')}>Sparse view</button>
          <button type="button" onClick={() => preset('Dense')}>Dense view</button>
        </div>
        <div className={s.actions} aria-label="Ring inspection">
          {([['Ring: far',104],['Ring: layers',116],['Ring: fracture',126]] as const).map(([name,beat])=>
            <button type="button" key={name} onClick={()=>{settings.current.playing=false;setPlaying(false);setFocus();switchDensity('flight');seek(reference.station(beat,'standard'));}}>{name}</button>)}
        </div>
          <label>Aurora structure <select value={nebulaInspection} onChange={e => {
            const value = Number(e.currentTarget.value);
            if (value) setFocus();
            settings.current.nebulaInspection = value;
            setNebulaInspection(value);
            if (value && (settings.current.station < reference.station(256, 'standard')
              || settings.current.station >= reference.station(320, 'standard'))) {
              settings.current.playing = false;
              setPlaying(false);
              switchDensity('flight');
              seek(reference.station(orbitSceneBeats[5], 'standard'));
            } else {
              viewer.current?.redraw();
            }
          }}>{auroraViews.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label>
          <label>Aphelion view <select value={aphelionFocus ?? 'course'} onChange={e => {
            const value = e.currentTarget.value;
            setFocus(value === 'course' ? undefined : value as AphelionFocus);
            if (value === 'course') {
              viewer.current?.redraw(true);
              return;
            }
            settings.current.playing = false;
            setPlaying(false);
            settings.current.nebulaInspection = 0;
            setNebulaInspection(0);
            switchDensity('flight');
            seek(reference.station(orbitSceneBeats[6], 'standard'));
          }}>
            <option value="course">Course camera</option>
            <option value="planet">Planet and rings</option>
            <option value="moon">Companion moon</option>
          </select></label>
        </SceneGroup>
        <SceneGroup title="STARWAKE lighting">
        <div className={s.actions} aria-label="STARWAKE lighting cues">
          {orbit.sections.map((section,index)=><button type="button" key={section.name} title={orbitLightScenes[index]}
            onClick={()=>viewer.current?.music(false,orbit.sections.slice(0,index).reduce((n,s)=>n+s.beats,0))}>Light: {section.name}</button>)}
        </div>
        <label>Music beat
          <input aria-label="Music beat" type="range" min="0" max="384" step="0.125" value={musicBeat}
            onChange={e=>viewer.current?.music(musicPlaying,Number(e.currentTarget.value))} />
          <span>{musicBeat.toFixed(2)} · {orbitLightScenes[metrics?.orbit ? Math.max(0,orbitLightScenes.indexOf(metrics.orbit.lighting.scene)) : 0]}</span>
        </label>
          <button type="button" disabled={!!status} onClick={()=>viewer.current?.music(!musicPlaying)}>{musicPlaying?'Pause STARWAKE':'Play STARWAKE'}</button>
          {soundStatus && <p role="status">{soundStatus}</p>}
          <label><input type="checkbox" checked={dynamicLights} onChange={e=>{
            settings.current.dynamicLights=e.currentTarget.checked;setDynamicLights(e.currentTarget.checked);viewer.current?.redraw();
          }} /> Dynamic lighting</label>
          <label><input type="checkbox" checked={reducedMotion} onChange={e=>{
            settings.current.reducedMotion=e.currentTarget.checked;setReducedMotion(e.currentTarget.checked);viewer.current?.redraw();
          }} /> Reduced motion</label>
          {lab === 'lighting' && <>
            <button type="button" onClick={() => {
              settings.current.playing = false; setPlaying(false); setFocus();
              seek(reference.station(settings.current.musicBeat, 'standard'));
            }}>Go to beat’s station</button>
            <button type="button" onClick={() => viewer.current?.music(false, worldBeat)}>Match beat to station</button>
          </>}
        </SceneGroup>
        <SceneGroup title="Rendering">
          <label>Density <select value={density} onChange={e => switchDensity(e.currentTarget.value as OrbitDensity)}>
            <option value="flight">Flight progression</option><option value="sparse">Sparse</option><option value="dense">Dense</option>
          </select></label>
          <label>Seed <input type="number" min="0" max="4294967295" value={seedDraft}
            onChange={e => setSeedDraft(e.currentTarget.value)} onBlur={applySeed} onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }} /></label>
          <SceneQuality quality={quality} change={value => {
            settings.current.quality = value;
            setQuality(value);
            viewer.current?.quality();
          }} />
        </SceneGroup>
        <p>Steer with mouse, touch or arrow keys. Hold Shift to boost.</p>
        {metrics?.orbit && <output aria-live="off" data-orbit-metrics={JSON.stringify(metrics)}>
          {metrics.calls} draw calls · {metrics.triangles.toLocaleString('en-US')} triangles · {metrics.orbit.instances} instances ·{' '}
          {metrics.orbit.visibleChunks}/{metrics.orbit.chunks} chunks · {metrics.orbit.descriptions} rock descriptions · LOD {metrics.orbit.lod.join(' / ')}
          {' · '}{metrics.orbit.setpieces.active.map(piece=>piece.id).join(' + ')}
          {' · '}{metrics.orbit.setpieces.active.reduce((count, piece) => count + piece.boulders.length, 0)} boulders
          {' · '}{metrics.orbit.setpieces.active.reduce((sum,piece)=>sum+piece.instances,0)} setpiece fragments · {metrics.orbit.objects} objects
          {' · '}Light {metrics.orbit.lighting.scene} · Key {metrics.orbit.lighting.key.toFixed(2)} / Fill {metrics.orbit.lighting.fill.toFixed(2)}
        </output>}
    </SceneControls>}
  </section>;
}
