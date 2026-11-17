import { useEffect, useRef, useState } from 'react';
import type { PlayMode, QualityTier } from '../game/contracts';
import { AudioTransport } from '../game/audio/transport.client';
import { branchLayout } from '../game/core/branches';
import type { RouteKind, RouteSide } from '../game/core/branches';
import { facilityStages } from '../game/core/descent-facility';
import { descentCargo, descentJunction } from '../game/core/descent-routes';
import { CONTROL_PHRASE_BEATS, controlLightPhrases } from '../game/core/descent-lighting';
import type { ControlLightView } from '../game/core/descent-lighting';
import { controlTrack } from '../game/core/descent-score';
import { referenceFor } from '../game/core/reference-track';
import { dynamicLightEnvelope, steadyLights } from '../game/core/rhythmic-lights';
import { CAPTURE_RUN_SEED } from '../game/core/run-seed';
import { volumeById } from '../game/core/volumes';
import type { ScenicPreview } from '../game/debug/scenic-preview.client';
import s from '../styles/debug.module.css';

const descent = volumeById('descent');
const offsets = [16, 7, 21, 31, 15, 26, 25];
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
  { label: 'Supply carrier', beat: descentCargo.beat - .9, route: 'score' },
  { label: 'Merge', beat: descentJunction.rejoin - 2.2, route: 'challenge' },
];

export function DescentFacilityPreview() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [section, setSection] = useState(1);
  const [junction, setJunction] = useState(-1);
  const [approachBeat, setApproachBeat] = useState(approachStart);
  const [approachRoute, setApproachRoute] = useState<RouteKind>('main');
  const [boost, setBoost] = useState(false);
  const [dynamic, setDynamic] = useState(true);
  const [lightOffset, setLightOffset] = useState(0);
  const [phrase, setPhrase] = useState(-1);
  const [bars, setBars] = useState(8);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<ControlLightView>('all');
  const [quality, setQuality] = useState<QualityTier>('high');
  const [flight, setFlight] = useState(-1);
  const [flightMode, setFlightMode] = useState<PlayMode>('standard');
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<ScenicPreview>(null);
  const transport = useRef<AudioTransport>(null);
  const playback = useRef({ generation: 0, beat: 0, paused: false });
  const flightClock = useRef({ seconds: 0, lastBeat: 0 });

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
    void import('../game/debug/scenic-preview.client').then(({ ScenicPreview }) => {
      if (stale || !canvas.current) return;
      viewer.current = new ScenicPreview(canvas.current, restored => {
        if (!restored) {
          haltAudio(true);
          setCursor(playback.current.beat);
        }
        setReady(restored);
        setStatus(restored ? '' : 'Waiting for WebGL to restore…');
      });
      setReady(true);
    }).catch(() => { if (!stale) setStatus('The facility preview needs a working WebGL2 renderer.'); });
    return () => { stale = true; viewer.current?.dispose(); viewer.current = null; };
  }, [open]);

  const chapter = controlTrack.sections[section];
  const setpiece = setpieceFlights[flight];
  const view = junctionViews[junction];
  const approach = junction === 0;
  const label = setpiece?.label ?? view?.label ?? facilityStages[section].name;
  const beat = setpiece?.from ?? (approach ? approachBeat : view?.beat ?? chapter.startBeat + offsets[section]);
  const route = setpiece ? approachRoute : approach ? approachRoute : view?.route;
  const side: RouteSide | undefined = route === 'main' ? 'center' : route && (layout.left === route ? 'left' : 'right');
  const mode = setpiece ? flightMode : 'standard';
  const station = referenceFor(descent).station(beat, mode);
  const from = setpiece?.from ?? auditionStart(phrase, bars);
  const through = setpiece?.through ?? from + bars * 4;
  const fixedLightBeat = playing ? null : !setpiece && phrase < 0 ? beat + lightOffset : cursor;

  function seek(value: number) {
    haltAudio();
    playback.current.beat = value;
    setCursor(value);
  }

  async function play(restart = false) {
    const state = playback.current;
    const resume = state.paused && !restart;
    const selected = phrase * CONTROL_PHRASE_BEATS;
    const at = restart || state.beat >= through || (!resume && state.beat === selected)
      ? from : Math.max(from, state.beat);
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
    if (!ready || !viewer.current) return;
    const preview = viewer.current;
    preview.configure(quality, window.devicePixelRatio);
    const camera = preview.select({ label, beat, boost: !setpiece && boost, side }, mode, beat, 'descent', station);
    if (setpiece) flightClock.current = { seconds: camera.seconds, lastBeat: beat };
  }, [ready, quality, label, beat, boost, side, station, mode, setpiece]);
  useEffect(() => {
    const preview = viewer.current;
    if (!ready || !preview) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const envelope = { ...steadyLights };
    const draw = (lightBeat: number) => {
      if (setpiece) {
        const clock = flightClock.current;
        if (lightBeat < clock.lastBeat) {
          clock.seconds = preview.select({ label, beat, boost: false, side }, mode, beat, 'descent', station).seconds;
        }
        preview.advance(clock.seconds + (lightBeat - beat) * secondsPerBeat, boost);
        clock.lastBeat = lightBeat;
      }
      preview.draw({ beat: lightBeat, descentFocus: focus, reducedMotion: motion.matches,
        dynamics: dynamicLightEnvelope(descent, lightBeat * secondsPerBeat, Number(dynamic), motion.matches, envelope) });
    };
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
        return;
      }
      if (Math.floor(current) !== displayed) setCursor(displayed = Math.floor(current));
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [ready, quality, beat, boost, side, fixedLightBeat, through, dynamic, focus, setpiece, label, mode, station]);

  return <section id="descent" className={s.section}>
    <h2>DESCENT facility</h2>
    <div className={s.scenicDesk}>
      <div className={s.scenicView}>
        {open ? <canvas ref={canvas} className={s.preview} width={800} height={450} role="img" aria-label="Live DESCENT facility" />
          : <button type="button" className={s.scan} onClick={() => setOpen(true)}>Open live facility</button>}
        {status && <p role="status">{status}</p>}
      </div>
      <div className={s.scenicControls}>
        <label>Setpiece flight <select value={flight} onChange={event => {
          const selected = Number(event.currentTarget.value);
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
        <label>CONTROL chapter <select value={section} disabled={!!setpiece} onChange={event => {
          setSection(Number(event.currentTarget.value));
          setJunction(-1);
          setLightOffset(0);
        }}>
          {controlTrack.sections.map(({ name }, i) => <option key={name} value={i}>{name} · {facilityStages[i].name}</option>)}
        </select></label>
        <label>Transfer chamber <select value={junction} disabled={!!setpiece} onChange={event => {
          setJunction(Number(event.currentTarget.value));
          setApproachBeat(approachStart);
          setLightOffset(0);
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
        <label>Facility quality <select value={quality} onChange={event => setQuality(event.currentTarget.value as QualityTier)}>
          <option value="low">Low</option><option value="auto">Auto</option><option value="high">High</option>
        </select></label>
        <label><input type="checkbox" checked={boost} onChange={event => setBoost(event.currentTarget.checked)} /> Boost view</label>
        <label><input type="checkbox" checked={dynamic} onChange={event => setDynamic(event.currentTarget.checked)} /> Dynamic lights</label>
        <label>Light beat offset <input type="range" min="0" max="4" step=".0625" value={lightOffset}
          disabled={!!setpiece || phrase >= 0} onChange={event => setLightOffset(event.currentTarget.valueAsNumber)} /></label>
        <label>Lighting phrase <select value={phrase} disabled={!!setpiece} onChange={event => {
          const value = Number(event.currentTarget.value);
          setPhrase(value);
          seek(value * CONTROL_PHRASE_BEATS);
        }}>
          <option value="-1">Camera beat</option>
          {controlLightPhrases.map(({ label }, i) =>
            <option key={label} value={i}>Bars {i * 4 + 1}–{i * 4 + 4} · {label}</option>)}
        </select></label>
        <label>Lighting focus <select value={focus} onChange={event => setFocus(event.currentTarget.value as ControlLightView)}>
          <option value="all">All groups</option><option value="roof">Ceiling</option><option value="floor">Floor</option>
          <option value="left">Left side</option><option value="right">Right side</option><option value="glass">Glass</option>
        </select></label>
        {(setpiece || phrase >= 0) && <>
          {!setpiece && <label>Playback length <select value={bars} onChange={event => {
            const length = Number(event.currentTarget.value);
            setBars(length);
            seek(phrase * CONTROL_PHRASE_BEATS);
          }}><option value="8">8 bars</option><option value="16">16 bars</option></select></label>}
          <label>Score beat <input type="range" min={from} max={through} step="1" value={Math.round(cursor)}
            onChange={event => seek(event.currentTarget.valueAsNumber)} /><output>{Math.round(cursor)}</output></label>
          <button type="button" className={s.scan} disabled={!ready} onClick={() => {
            if (playing) {
              haltAudio(true);
              setCursor(playback.current.beat);
            } else void play();
          }}>{playing ? 'Pause lighting' : 'Play lighting'}</button>
          <button type="button" className={s.scan} disabled={!ready} onClick={() => void play(true)}>Replay lighting</button>
        </>}
        <a href={`/?vol=descent&t=${(beat * 60 / descent.bpm).toFixed(4)}&align=1&q=${quality}&lights=${dynamic}&mode=${mode}${side ? `&route=${side}` : ''}${boost ? '&boost=1' : ''}`}>Open the game view</a>
        <a href="#gates-descent">Inspect the holographic glass gates</a>
      </div>
    </div>
  </section>;
}
