import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { VolumeId } from '../game/contracts';
import { PICKUP_BEAT } from '../game/core/pickups';
import { volumeById } from '../game/core/volumes';
import { catalog, environmentCards, gateNotes, pickupCards } from '../game/debug/catalog';
import type { ModelPreviews } from '../game/debug/previews.client';
import { channelNames, effectIds, effectPresets, surfaceChannels, surfaceIds, surfacePresets } from '../game/graphics/materials/presets';
import type { SurfaceChannel, SurfaceMaterialId } from '../game/graphics/materials/presets';
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
  const [scanning, setScanning] = useState(false);
  const [surface, setSurface] = useState<SurfaceMaterialId>('alloy-satin-dark');
  const [channel, setChannel] = useState<SurfaceChannel>('color');
  const [inspect, setInspect] = useState<((id: SurfaceMaterialId, channel: SurfaceChannel) => void) | null>(null);

  useEffect(() => { inspect?.(surface, channel); }, [inspect, surface, channel]);

  useEffect(() => {
    const container = root.current!;
    let stale = false;
    let timer: number | undefined;
    let viewer: ModelPreviews | undefined;
    let releaseMaterials: (() => void) | undefined;
    void Promise.all([import('../game/debug/previews.client'), import('../game/graphics/materials/library.client')]).then(([
      { ModelPreviews, renderRawSurfaces, renderRawChannel, renderEnvironment, renderWorlds }, { MaterialLibrary },
    ]) => {
      if (stale) return;
      const materials = new MaterialLibrary(true);
      releaseMaterials = () => materials.dispose();
      setInspect(() => (id: SurfaceMaterialId, channel: SurfaceChannel) => renderRawChannel(container, materials, id, channel));
      try {
        viewer = new ModelPreviews(container, materials, restored => {
          setModelReady(restored);
          setModelStatus(restored ? '' : 'WebGL previews interrupted. The last images remain available.');
          setMaterialStatus(restored ? '' : 'Waiting for WebGL to restore the lit previews.');
        });
        viewer.drawPickups(initialAngle);
        viewer.drawGates();
        viewer.drawMaterials();
        models.current = viewer;
        setModelReady(true);
        setModelStatus('');
      } catch (error) {
        viewer?.dispose();
        viewer = undefined;
        setModelStatus(error instanceof Error ? error.message : 'The 3D previews could not render.');
        renderRawSurfaces(container, materials);
        setMaterialStatus('Lit previews unavailable. These cards show base color; raw channels are still available.');
      }
      renderEnvironment(container);
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
      releaseMaterials?.();
      models.current = null;
    };
  }, []);

  return (
    <main ref={root} className={s.page}>
      <header className={s.header}>
        <a href="/" className={s.brand}>SoFaraway</a>
        <nav aria-label="Debug sections">
          <a href="#pickups">Pickups</a><a href="#volumes">Volumes</a><a href="#gates">Gates</a>
          <a href="#materials">Materials</a><a href="#effects">Effects</a><a href="#environment">Environment</a><a href="#audio">Audio</a>
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
          <h2>Surface materials</h2>
          <p>ELSEWHERE specimens share the same light and scale.</p>
          <div className={s.actions}>
            <a href="/?vol=elsewhere&t=36&q=high&align=1">Inspect the tunnel</a>
            <a href="/?vol=elsewhere&t=156.328125&route=left&q=high&align=1">Inspect the junction</a>
          </div>
          {materialStatus && <p role="status">{materialStatus}</p>}
          <div className={s.trio}>
            {surfaceIds.map(id => {
              const { name, detail, metalness, roughness } = surfacePresets[id];
              return <figure key={id} className={s.card}>
                <Preview id={id} label={`${name} material preview`} />
                <figcaption className={s.caption}><h3>{name}</h3><p>{detail}</p>
                  <p className={s.materialValues}>Metalness {metalness.toFixed(2)} · Roughness {roughness.toFixed(2)}</p></figcaption>
              </figure>;
            })}
          </div>
          <div className={s.inspector}>
            <div>
              <h3>Inspect raw channels</h3>
              <p>Height is the source for normals. Its display stretches the sample range so shallow grooves remain visible.</p>
              <label className={s.surfaceSelect}>Surface
                <select value={surface} disabled={!inspect} onChange={event => {
                  const id = event.currentTarget.value as SurfaceMaterialId;
                  setSurface(id);
                  if (!surfaceChannels(id).includes(channel)) setChannel('color');
                }}>
                  {surfaceIds.map(id => <option key={id} value={id}>{surfacePresets[id].name}</option>)}
                </select>
              </label>
              <div className={s.channelControls} role="group" aria-label="Texture channel">
                {surfaceChannels(surface).map(id => <button key={id} type="button" disabled={!inspect} aria-pressed={channel === id}
                  onClick={() => setChannel(id)}>{channelNames[id]}</button>)}
              </div>
              <p className={s.materialValues}>{surfacePresets[surface].resolution}² · Tile {surfacePresets[surface].tile.map(n => n.toFixed(2)).join(' × ')} units</p>
            </div>
            <Preview id="surface-channel" label={`${surfacePresets[surface].name}: ${channelNames[channel]}`} width={256} height={256} />
          </div>
        </section>

        <section id="effects" className={s.section}>
          <h2>Effect materials</h2>
          <p>Light and transparent film for future fixtures.</p>
          <div className={s.worlds}>
            {effectIds.map(id => <figure key={id} className={s.card}>
              <Preview id={id} label={`${effectPresets[id].name} effect preview`} />
              <figcaption className={s.caption}><h3>{effectPresets[id].name}</h3><p>{effectPresets[id].detail}</p>
                {id === 'hologram-panel-cyan' && <button className={s.scan} type="button" disabled={!modelReady}
                  aria-pressed={scanning} onClick={() => { setScanning(!scanning); models.current?.setScan(!scanning); }}>
                  Animate scan</button>}
              </figcaption>
            </figure>)}
          </div>
        </section>

        <section id="environment" className={s.section}>
          <h2>Environment</h2>
          <div className={s.swatches}>
            {environmentCards.map(({ id, name, detail }) => (
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
