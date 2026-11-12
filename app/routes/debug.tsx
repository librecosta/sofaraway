import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { VolumeId } from '../game/contracts';
import { PICKUP_BEAT } from '../game/core/pickups';
import { volumeById } from '../game/core/volumes';
import { catalog, gateNotes, materialCards, pickupCards } from '../game/debug/catalog';
import type { ModelPreviews } from '../game/debug/previews.client';
import s from '../styles/debug.module.css';

export const meta = () => [
  { title: 'SoFaraway — Debug overview' },
  { name: 'robots', content: 'noindex' },
];

const initialAngle = -20;

function Preview({ id, label, width = 432, height = 270 }: {
  id: string; label: string; width?: number; height?: number;
}) {
  return <canvas data-preview={id} className={s.preview} role="img" aria-label={label}
    width={width} height={height}>{label}</canvas>;
}

function Soundtrack() {
  const [volume, setVolume] = useState<VolumeId>('elsewhere');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    setVolume(volumeById(new URLSearchParams(location.search).get('vol')).id);
    setReady(true);
  }, []);

  async function download() {
    setBusy(true);
    const definition = volumeById(volume);
    setStatus(`Rendering ${definition.name}…`);
    try {
      const { exportSoundtrack } = await import('../game/debug/audio-export.client');
      const seconds = Number(new URLSearchParams(location.search).get('secs'));
      const { blob, duration } = await exportSoundtrack(definition, seconds);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sofaraway-${volume}.wav`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus(`Done · ${(blob.size / 1048576).toFixed(1)} MB · ${duration.toFixed(1)} s`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Soundtrack render failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="audio" className={s.section}>
      <h2>Soundtrack</h2>
      <p>Export a WAV using the same synthesizer and score as the game.</p>
      <div className={s.audioControls}>
        <div className={s.audioField}>
          <label htmlFor="debug-audio-volume">Volume</label>
          <select id="debug-audio-volume" value={volume} disabled={!ready || busy}
            onChange={event => setVolume(volumeById(event.currentTarget.value).id)}>
            {catalog.map(({ volume }) => <option key={volume.id} value={volume.id}>{volume.name}</option>)}
          </select>
        </div>
        <button type="button" disabled={!ready || busy} onClick={() => void download()}>
          {busy ? 'Rendering…' : 'Render to WAV'}
        </button>
      </div>
      <p role="status" id="audio-status">{status}</p>
    </section>
  );
}

export default function DebugOverview() {
  const root = useRef<HTMLElement>(null);
  const models = useRef<ModelPreviews>(null);
  const [angle, setAngle] = useState(initialAngle);
  const [modelStatus, setModelStatus] = useState('Loading the 3D previews…');
  const [worldStatus, setWorldStatus] = useState('Rendering the four worlds…');
  const [materialStatus, setMaterialStatus] = useState('');
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    const container = root.current!;
    let stale = false;
    let timer: number | undefined;
    let viewer: ModelPreviews | undefined;
    void import('../game/debug/previews.client').then(({ ModelPreviews, renderMaterials, renderWorlds }) => {
      if (stale) return;
      try {
        viewer = new ModelPreviews(container);
        viewer.drawPickups(initialAngle);
        viewer.drawGates();
        models.current = viewer;
        setModelReady(true);
        setModelStatus('');
      } catch (error) {
        viewer?.dispose();
        viewer = undefined;
        setModelStatus(error instanceof Error ? error.message : 'The 3D previews could not render.');
      }
      try { renderMaterials(container); } catch { setMaterialStatus('The material previews could not render.'); }
      timer = window.setTimeout(() => {
        try { renderWorlds(container); setWorldStatus(''); } catch {
          setWorldStatus('The scene previews could not render on this device.');
        }
      }, 0);
    }).catch(() => {
      if (stale) return;
      setModelStatus('The 3D preview module could not load. Reload to try again.');
      setWorldStatus('Scene previews unavailable.');
      setMaterialStatus('Material previews unavailable.');
    });
    return () => {
      stale = true;
      window.clearTimeout(timer);
      viewer?.dispose();
      models.current = null;
    };
  }, []);

  return (
    <main ref={root} className={s.page}>
      <header className={s.header}>
        <a href="/" className={s.brand}>SoFaraway</a>
        <nav aria-label="Debug sections">
          <a href="#pickups">Pickups</a><a href="#volumes">Volumes</a><a href="#gates">Gates</a>
          <a href="#materials">Materials</a><a href="#audio">Audio</a>
        </nav>
        <a href="/" className={s.back}>Back to game</a>
      </header>
      <div className={s.content}>
        <h1>Debug overview</h1>
        <p className={s.intro}>Inspect the worlds, gates, pickups and materials generated by SoFaraway.</p>
        <noscript><p>Enable JavaScript to render previews and export audio.</p></noscript>

        <section id="pickups" className={s.section}>
          <div className={s.sectionHead}>
            <div><h2>Floating pickups</h2><p>ELSEWHERE · BREAK · Beat {PICKUP_BEAT}</p></div>
            <div className={s.angle}>
              <label htmlFor="debug-view-angle">View angle</label>
              <input id="debug-view-angle" type="range" min="-85" max="85" value={angle} disabled={!modelReady}
                onChange={event => {
                  const value = event.currentTarget.valueAsNumber;
                  setAngle(value);
                  models.current?.drawPickups(value);
                }} />
              <output htmlFor="debug-view-angle">{angle}°</output>
            </div>
          </div>
          {modelStatus && <p role="status">{modelStatus}</p>}
          <div className={s.trio}>
            {pickupCards.map(({ kind, name, effect, color }) => (
              <article key={kind} className={s.pickup} style={{ '--pickup-color': color } as CSSProperties}>
                <Preview id={kind} label={`${name} 3D model`} />
                <div className={s.caption}><h3>{name}</h3><p>{effect}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section id="volumes" className={s.section}>
          <h2>Volumes</h2>
          {worldStatus && <p role="status">{worldStatus}</p>}
          <div className={s.worlds}>
            {catalog.map(({ volume, seconds, gates, gateCount }) => (
              <article key={volume.id} className={s.card}>
                <Preview id={volume.id} label={`${volume.name} gameplay view`} width={640} height={360} />
                <div className={s.caption}>
                  <h3>{volume.subtitle} / {volume.name}</h3>
                  <p>{volume.bpm} BPM · {gateCount} gates on Normal · {volume.topology}</p>
                  <div className={s.actions}>
                    <a href={`/?vol=${volume.id}&t=${seconds}&align=1&god=0&dbg=1`}>Open this frame</a>
                    <a href={`#gates-${volume.id}`}>View {gates.length === 1 ? 'gate' : 'gates'}</a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="gates" className={s.section}>
          <h2>Gate library</h2>
          <p>Face-on views of the glass and its opening. Directional gates show one example.</p>
          <div className={s.gateLibrary}>
            {catalog.map(({ volume, gates }) => (
              <div key={volume.id} id={`gates-${volume.id}`} className={gates.length > 1 ? s.gateGroupWide : s.gateGroup}>
                <h3>{volume.subtitle} / {volume.name}</h3>
                <div className={gates.length > 1 ? s.trio : s.gateSingle}>
                  {gates.map(kind => (
                    <figure key={kind} className={s.card}>
                      <Preview id={kind} label={`${kind} gate`} />
                      <figcaption className={s.caption}><strong className={s.gateName}>{kind}</strong><p>{gateNotes[kind]}</p></figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="materials" className={s.section}>
          <h2>Materials</h2>
          {materialStatus && <p role="status">{materialStatus}</p>}
          <div className={s.swatches}>
            {materialCards.map(({ id, name, detail }) => (
              <figure key={id} className={s.card}>
                <Preview id={id} label={name} width={320} height={320} />
                <figcaption className={s.caption}><strong>{name}</strong><p>{detail}</p></figcaption>
              </figure>
            ))}
          </div>
        </section>

        <Soundtrack />
      </div>
    </main>
  );
}
