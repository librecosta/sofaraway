import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { PlayMode, QualityTier } from '../game/contracts';
import { AudioTransport } from '../game/audio/transport.client';
import { branchLayout } from '../game/core/branches';
import type { RouteKind, RouteSide } from '../game/core/branches';
import { facilityStages } from '../game/core/descent-facility';
import { descentCargo, descentJunction } from '../game/core/descent-routes';
import { CONTROL_PHRASE_BEATS, controlLightPhrases } from '../game/core/descent-lighting';
import type { ControlLightView } from '../game/core/descent-lighting';
import { controlTrack } from '../game/core/descent-score';
import { referenceFor, START_DISTANCE } from '../game/core/reference-track';
import { dynamicLightEnvelope, steadyLights } from '../game/core/rhythmic-lights';
import { CAPTURE_RUN_SEED } from '../game/core/run-seed';
import { sectionAt, volumeById } from '../game/core/volumes';
import { previewGameHref, previewNumber, previewQuality, stationBeat } from '../game/debug/explorer-scene';
import type { ScenicPreview } from '../game/debug/scenic-preview.client';
import { SceneControls, SceneGroup, SceneQuality, SceneViewport, type LabMode } from './explorer/LiveScene';
import s from '../styles/explorer-lab.module.css';

const descent = volumeById('descent');
const offsets = [16, 7, 21, 31, descentCargo.beat - controlTrack.sections[4].startBeat - .9, 26, 25];
const layout = branchLayout(CAPTURE_RUN_SEED);
const approachStart = descentJunction.preview - 5;
const secondsPerBeat = 60 / descent.bpm;
const auditionStart = (phrase: number, bars: number) => Math.min(phrase * CONTROL_PHRASE_BEATS, descent.beats - bars * 4);
const setpieceFlights = [
  { label: 'TRANSFER · Spiral Light Chase', from: approachStart, through: 170 },
  { label: 'THE WELL · Depth Awakening', from: controlTrack.sections[3].startBeat - 1, through: controlTrack.sections[4].startBeat },
  { label: 'CORE · Mechanical Heartbeat', from: controlTrack.sections[4].startBeat - 2, through: controlTrack.sections[5].startBeat + 3 },
  { label: 'LOCKDOWN to BREACH · Security System Release', from: controlTrack.sections[5].startBeat - 2, through: descent.beats },
] as const;
const junctionViews: readonly { label: string; beat: number; route?: RouteKind }[] = [
  { label: 'Approach', beat: approachStart },
  { label: 'Main spine', beat: 148, route: 'main' },
  { label: 'Challenge guideway', beat: 151, route: 'challenge' },
  { label: 'Bonus guideway', beat: 151, route: 'score' },
  { label: 'Merge', beat: descentJunction.rejoin - 2.2, route: 'challenge' },
];

export function DescentFacilityPreview({ lab }: { lab: LabMode }) {
  const [params] = useSearchParams();
  const reference = referenceFor(descent);
  const maxStation = reference.station(descent.beats - .001, 'standard');
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [section, setSection] = useState(params.has('station')
    ? sectionAt(descent, stationBeat(descent, previewNumber(params, 'station', START_DISTANCE, START_DISTANCE, maxStation)))?.i ?? 6 : 1);
  const [junction, setJunction] = useState(-1);
  const [approachBeat, setApproachBeat] = useState(approachStart);
  const [approachRoute, setApproachRoute] = useState<RouteKind>('main');
  const [boost, setBoost] = useState(false);
  const [dynamic, setDynamic] = useState(params.get('lights') !== 'false');
  const [reduced, setReduced] = useState(params.get('reduce') === 'true');
  const [yaw, setYaw] = useState(previewNumber(params, 'view', 0, -36, 36));
  const [stationOverride, setStationOverride] = useState<number | undefined>(params.has('station')
    ? previewNumber(params, 'station', reference.station(controlTrack.sections[1].startBeat + offsets[1], 'standard'), START_DISTANCE, maxStation)
    : undefined);
  const [lightBeatOverride, setLightBeatOverride] = useState<number | undefined>(params.has('beat')
    ? previewNumber(params, 'beat', 0, 0, descent.beats) : undefined);
  const [flying, setFlying] = useState(false);
  const [displayStation, setDisplayStation] = useState<number>();
  const [lightOffset, setLightOffset] = useState(0);
  const [phrase, setPhrase] = useState(-1);
  const [bars, setBars] = useState(8);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<ControlLightView>('all');
  const [quality, setQuality] = useState<QualityTier>(previewQuality(params));
  const [flight, setFlight] = useState(-1);
  const [flightMode, setFlightMode] = useState<PlayMode>('standard');
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<ScenicPreview>(null);
  const transport = useRef<AudioTransport>(null);
  const playback = useRef({ generation: 0, beat: 0, paused: false });
  const flightClock = useRef({ seconds: 0, lastBeat: 0 });
  const cameraClock = useRef({ seconds: 0, station: START_DISTANCE });
  const activity = useRef({ flying, playing, phrase, flight });
  useEffect(() => { activity.current = { flying, playing, phrase, flight }; }, [flying, playing, phrase, flight]);

  function haltAudio(resume = false) {
    playback.current.generation++;
    playback.current.paused = resume;
    transport.current?.stop(resume);
    setPlaying(false);
  }

  useEffect(() => () => {
    playback.current.generation++;
    transport.current?.dispose();
    transport.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    const pause = () => {
      const active = activity.current;
      if (active.playing) {
        haltAudio(true);
        setCursor(playback.current.beat);
        if (active.phrase < 0 && active.flight < 0) setLightBeatOverride(playback.current.beat);
      }
      if (active.flying) {
        setStationOverride(cameraClock.current.station);
        setFlying(false);
      }
    };
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', visibility);
    void import('../game/debug/scenic-preview.client').then(({ ScenicPreview }) => {
      if (stale || !canvas.current) return;
      viewer.current = new ScenicPreview(canvas.current, (restored, failed) => {
        if (!restored) pause();
        setReady(restored);
        setStatus(restored ? '' : failed ? 'Could not render the facility.' : 'Waiting for WebGL to restore…');
      });
      setReady(true);
      setStatus('');
    }).catch(() => { if (!stale) setStatus('Could not open the facility. A working WebGL2 renderer is required.'); });
    return () => {
      stale = true;
      document.removeEventListener('visibilitychange', visibility);
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [open, attempt]);

  const chapter = controlTrack.sections[section];
  const setpiece = setpieceFlights[flight];
  const view = junctionViews[junction];
  const approach = junction === 0;
  const label = setpiece?.label ?? view?.label ?? facilityStages[section].name;
  const beat = setpiece?.from ?? (approach ? approachBeat : view?.beat ?? chapter.startBeat + offsets[section]);
  const route = setpiece ? approachRoute : approach ? approachRoute : view?.route;
  const side: RouteSide | undefined = route === 'main' ? 'center' : route && (layout.left === route ? 'left' : 'right');
  const mode = setpiece ? flightMode : 'standard';
  const station = !setpiece && stationOverride !== undefined ? stationOverride : reference.station(beat, mode);
  const from = setpiece?.from ?? (phrase < 0 ? 0 : auditionStart(phrase, bars));
  const through = setpiece?.through ?? (phrase < 0 ? descent.beats : from + bars * 4);
  const musicBeat = lightBeatOverride ?? (lab === 'lighting' ? controlTrack.sections[1].startBeat + offsets[1] : beat);
  const fixedLightBeat = playing ? null : !setpiece && phrase < 0 ? Math.min(descent.beats, musicBeat + lightOffset) : cursor;

  function seek(value: number) {
    haltAudio();
    playback.current.beat = value;
    setCursor(value);
  }

  async function play(restart = false) {
    const state = playback.current;
    const resume = state.paused && !restart;
    const selected = phrase * CONTROL_PHRASE_BEATS;
    const start = !setpiece && phrase < 0 && !resume ? fixedLightBeat ?? state.beat : state.beat;
    const at = restart || start >= through || (!resume && start === selected) ? from : Math.max(from, start);
    haltAudio(resume);
    const generation = state.generation;
    const audio = transport.current ??= new AudioTransport(() => {
      haltAudio(true);
      setCursor(playback.current.beat);
      setStatus('Sound is interrupted. Resume to continue the preview.');
    });
    state.beat = at;
    setCursor(at);
    setStatus('');
    const started = await audio.start(descent, at * secondsPerBeat, resume).catch(() => false);
    if (generation !== state.generation) return;
    if (started) setPlaying(true);
    else setStatus('Sound could not start. You can still scrub the lighting score.');
  }
  useEffect(() => {
    if (!ready) return;
    viewer.current?.configure(quality, window.devicePixelRatio);
  }, [quality, ready]);

  useEffect(() => {
    if (!ready || !viewer.current) return;
    const preview = viewer.current;
    const camera = preview.select({ label, beat, boost: !setpiece && boost, side }, mode, beat, 'descent', station);
    if (!camera) return;
    cameraClock.current = { seconds: camera.seconds, station: camera.station };
    setDisplayStation(camera.station);
    if (setpiece) flightClock.current = { seconds: camera.seconds, lastBeat: beat };
  }, [ready, label, beat, boost, side, station, mode, setpiece]);
  useEffect(() => {
    const preview = viewer.current;
    if (!ready || !preview) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const envelope = { ...steadyLights };
    const draw = (lightBeat: number) => {
      if (setpiece) {
        const clock = flightClock.current;
        if (lightBeat < clock.lastBeat) {
          const camera = preview.select({ label, beat, boost: false, side }, mode, beat, 'descent', station);
          if (!camera) return;
          clock.seconds = camera.seconds;
        }
        const at = preview.advance(clock.seconds + (lightBeat - beat) * secondsPerBeat, boost);
        if (at !== undefined) setDisplayStation(Math.round(at));
        clock.lastBeat = lightBeat;
      }
      preview.draw({ beat: lightBeat, yaw: yaw * Math.PI / 180, descentFocus: focus, reducedMotion: reduced || motion.matches,
        dynamics: dynamicLightEnvelope(descent, lightBeat * secondsPerBeat, Number(dynamic), reduced || motion.matches, envelope) });
    };
    if (flying) {
      const start = performance.now(), seconds = cameraClock.current.seconds;
      let frame = 0, published = start;
      const fly = (now: number) => {
        const elapsed = (now - start) / 1000;
        const at = preview.advance(seconds + elapsed, boost) ?? station;
        cameraClock.current.station = at;
        draw((fixedLightBeat ?? beat) + elapsed / secondsPerBeat);
        if (now - published >= 100) { setDisplayStation(at); published = now; }
        if (at >= maxStation || elapsed + seconds >= descent.beats * secondsPerBeat) {
          setFlying(false);
          setStationOverride(maxStation);
        } else frame = requestAnimationFrame(fly);
      };
      frame = requestAnimationFrame(fly);
      return () => cancelAnimationFrame(frame);
    }
    if (fixedLightBeat !== null) {
      const redraw = () => draw(fixedLightBeat);
      redraw();
      motion.addEventListener('change', redraw);
      return () => motion.removeEventListener('change', redraw);
    }
    let frame = 0, displayed = Math.floor(playback.current.beat);
    const render = (now: number) => {
      const audio = transport.current;
      const time = audio?.outputTimeAt(now / 1000) ?? audio?.time;
      if (typeof time !== 'number') return;
      const current = playback.current.beat = Math.max(playback.current.beat, Math.min(through, time / secondsPerBeat));
      draw(current);
      if (current >= through) {
        haltAudio();
        setCursor(through);
        if (!setpiece && phrase < 0) setLightBeatOverride(Math.max(0, through - lightOffset));
        return;
      }
      if (Math.floor(current) !== displayed) setCursor(displayed = Math.floor(current));
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [ready, quality, beat, boost, side, fixedLightBeat, through, dynamic, focus, setpiece, label, mode, station,
    yaw, reduced, flying, maxStation, phrase, lightOffset]);

  function reset() {
    seek(0); setFlying(false); setSection(1); setJunction(-1); setFlight(-1); setFlightMode('standard');
    setApproachBeat(approachStart); setApproachRoute('main'); setStationOverride(undefined);
    setLightBeatOverride(undefined); setYaw(0); setLightOffset(0); setPhrase(-1); setBars(8);
    setFocus('all'); setBoost(false); setDynamic(true); setReduced(false); setQuality('auto');
  }

  const shownStation = flying || setpiece ? displayStation ?? station : station;
  const gameBeat = !setpiece && stationOverride === undefined ? beat : stationBeat(descent, shownStation, mode);
  const snapshot = new URLSearchParams({ vol: descent.id, station: shownStation.toFixed(3),
    beat: (playing ? cursor : fixedLightBeat ?? musicBeat).toFixed(3), q: quality, view: String(yaw),
    lights: String(dynamic), reduce: String(reduced) });
  return <section id="descent" className={s.preview}>
    <SceneViewport volume="descent" label="Live DESCENT facility" canvas={canvas} open={open} status={status}
      onOpen={() => { setStatus('Loading live scene…'); if (open) setAttempt(attempt + 1); else setOpen(true); }} />
    <SceneControls>
      <SceneGroup title="Scene">
        <label>CONTROL chapter <select value={section} disabled={!!setpiece} onChange={event => {
          setFlying(false); setStationOverride(undefined); setSection(Number(event.currentTarget.value)); setJunction(-1);
          if (lab === 'worlds') setLightOffset(0);
        }}>
          {controlTrack.sections.map(({ name }, i) => <option key={name} value={i}>{name} · {facilityStages[i].name}</option>)}
        </select></label>
        <label>World station <input aria-label="World station" type="range" min={START_DISTANCE} max={maxStation} step="any"
          value={shownStation} disabled={!!setpiece} onChange={event => {
            const value = event.currentTarget.valueAsNumber;
            setFlying(false); setJunction(-1); setStationOverride(value);
            setSection(sectionAt(descent, stationBeat(descent, value))?.i ?? 6);
          }} /><output>{shownStation.toFixed(1)}</output></label>
        <div className={s.actions}>
          {lab === 'worlds' && !setpiece && <button type="button" disabled={!ready} onClick={() => {
            if (flying) setStationOverride(cameraClock.current.station);
            else if (playing) haltAudio();
            setFlying(!flying);
          }}>{flying ? 'Pause flight' : 'Play flight'}</button>}
          <button type="button" onClick={reset}>Reset</button>
          <a href={previewGameHref('descent', gameBeat * secondsPerBeat, quality, dynamic, mode, side, boost)}>Open in game</a>
          <a href={`/debug/${lab}/?${snapshot}`}>Link to this view</a>
        </div>
      </SceneGroup>
      <SceneGroup title="Camera and facility">
        <label>View angle <input aria-label="View angle" type="range" min="-36" max="36" step="1" value={yaw}
          onChange={event => setYaw(event.currentTarget.valueAsNumber)} /><output>{yaw}°</output></label>
        <SceneQuality quality={quality} change={setQuality} />
        <label>Setpiece flight <select value={flight} onChange={event => {
          const selected = Number(event.currentTarget.value);
          setFlying(false); setStationOverride(undefined);
          setFlight(selected);
          setPhrase(-1);
          seek(setpieceFlights[selected]?.from ?? 0);
        }}>
          <option value="-1">Fixed camera</option>
          {setpieceFlights.map(({ label }, i) => <option key={label} value={i}>{label}</option>)}
        </select></label>
        {setpiece && <label>Flight mode <select value={flightMode} onChange={event => setFlightMode(event.currentTarget.value as PlayMode)}>
          <option value="standard">Standard</option><option value="sightseeing">Sightseeing</option>
        </select></label>}
        <label>Transfer chamber <select value={junction} disabled={!!setpiece} onChange={event => {
          setFlying(false); setStationOverride(undefined);
          setJunction(Number(event.currentTarget.value));
          setApproachBeat(approachStart);
          if (lab === 'worlds') setLightOffset(0);
        }}>
          <option value="-1">Chapter camera</option>
          {junctionViews.map(({ label }, i) => <option key={label} value={i}>{label}</option>)}
        </select></label>
        {approach && !setpiece && <>
          <label>Approach beat <input type="range" min={approachStart} max={descentJunction.open.standard + .5}
            step=".125" value={approachBeat} onChange={event => setApproachBeat(event.currentTarget.valueAsNumber)} />
            <output>{approachBeat.toFixed(2)}</output></label>
        </>}
        {(approach || flight === 0) &&
          <label>Approach route <select value={approachRoute} onChange={event => setApproachRoute(event.currentTarget.value as RouteKind)}>
            <option value="main">Main</option><option value="challenge">Challenge</option><option value="score">Bonus</option>
          </select></label>
        }
        <label><input type="checkbox" checked={boost} onChange={event => setBoost(event.currentTarget.checked)} /> Boost view</label>
        <a href="/debug/gates/?vol=descent">Inspect the holographic glass gates</a>
      </SceneGroup>
      <SceneGroup title="CONTROL lighting" id="beat-inspection">
        <label><input type="checkbox" checked={dynamic} onChange={event => setDynamic(event.currentTarget.checked)} /> Dynamic lighting</label>
        <label><input type="checkbox" checked={reduced} onChange={event => setReduced(event.currentTarget.checked)} /> Reduced motion</label>
        {lab === 'lighting' && !setpiece && phrase < 0 && <label>Music beat
          <input aria-label="Music beat" type="range" min="0" max={descent.beats} step=".125" value={playing ? cursor : musicBeat}
            onChange={event => { const value = event.currentTarget.valueAsNumber; seek(value); setLightBeatOverride(value); }} />
          <output>{(playing ? cursor : fixedLightBeat ?? musicBeat).toFixed(2)}</output>
        </label>}
        {lab === 'lighting' && !setpiece && phrase < 0 && <button type="button" onClick={() => {
          const worldBeat = stationBeat(descent, station);
          seek(worldBeat); setLightBeatOverride(worldBeat); setLightOffset(0);
        }}>Match beat to station</button>}
        {lab === 'lighting' && !setpiece && <button type="button" onClick={() => {
          const at = playing ? playback.current.beat : fixedLightBeat ?? musicBeat;
          setStationOverride(reference.station(at, 'standard')); setJunction(-1);
          setSection(sectionAt(descent, Math.min(at, descent.beats - .001))!.i);
        }}>Go to beat’s station</button>}
        <label>Light beat offset <input type="range" min="0" max="4" step=".0625" value={lightOffset}
          disabled={!!setpiece || phrase >= 0} onChange={event => setLightOffset(event.currentTarget.valueAsNumber)} /></label>
        <label>Lighting phrase <select value={phrase} disabled={!!setpiece} onChange={event => {
          const value = Number(event.currentTarget.value);
          setPhrase(value);
          seek(value * CONTROL_PHRASE_BEATS);
        }}>
          <option value="-1">{lab === 'lighting' ? 'Full score' : 'Camera beat'}</option>
          {controlLightPhrases.map(({ label }, i) =>
            <option key={label} value={i}>Bars {i * 4 + 1}–{i * 4 + 4} · {label}</option>)}
        </select></label>
        <label>Lighting focus <select value={focus} onChange={event => setFocus(event.currentTarget.value as ControlLightView)}>
          <option value="all">All groups</option><option value="roof">Ceiling</option><option value="floor">Floor</option>
          <option value="left">Left side</option><option value="right">Right side</option><option value="glass">Glass</option>
        </select></label>
        {(setpiece || phrase >= 0 || lab === 'lighting') && <>
          {!setpiece && phrase >= 0 && <label>Playback length <select value={bars} onChange={event => {
            const length = Number(event.currentTarget.value);
            setBars(length);
            seek(phrase * CONTROL_PHRASE_BEATS);
          }}><option value="8">8 bars</option><option value="16">16 bars</option></select></label>}
          {(setpiece || phrase >= 0) && <label>Score beat <input type="range" min={from} max={through} step="1" value={Math.round(cursor)}
            onChange={event => seek(event.currentTarget.valueAsNumber)} /><output>{Math.round(cursor)}</output></label>}
          <button type="button" disabled={!ready} onClick={() => {
            if (playing) {
              haltAudio(true);
              setCursor(playback.current.beat);
              if (phrase < 0 && !setpiece) setLightBeatOverride(Math.max(0, playback.current.beat - lightOffset));
            } else {
              if (flying) { setStationOverride(cameraClock.current.station); setFlying(false); }
              void play();
            }
          }}>{playing ? 'Pause lighting' : 'Play lighting'}</button>
          <button type="button" disabled={!ready} onClick={() => {
            if (flying) { setStationOverride(cameraClock.current.station); setFlying(false); }
            void play(true);
          }}>Replay lighting</button>
        </>}
      </SceneGroup>
    </SceneControls>
  </section>;
}
