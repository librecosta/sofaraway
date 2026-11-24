import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EndSequenceStudio } from '../components/EndSequenceStudio';
import { UIStateStudio } from '../components/UIStateStudio';
import type { VolumeId } from '../game/contracts';
import { PICKUP_BEAT } from '../game/core/pickups';
import { chartFor } from '../game/core/chart';
import { daybreakGates, isDaybreakGate } from '../game/core/daybreak-gates';
import { isDescentGate } from '../game/core/descent-gates';
import type { GateKind } from '../game/core/volumes';
import { referenceFor } from '../game/core/reference-track';
import { volumeById } from '../game/core/volumes';
import { isOrbitGate, orbitPresets } from '../game/core/orbit-gates';
import { catalog, descentExamples, gateDescription, pickupCards } from '../game/debug/catalog';
import type { ModelPreviews } from '../game/debug/previews.client';
import { channelNames, effectIds, effectPresets, surfaceChannels, surfaceIds, surfacePresets } from '../game/graphics/materials/presets';
import type { SurfaceChannel, SurfaceMaterialId } from '../game/graphics/materials/presets';
import s from '../styles/debug.module.css';

export const meta = () => [
  { title: 'SoFarAway / Legacy experiments' },
  { name: 'robots', content: 'noindex' },
];

const initialAngle = -20;

function Preview({ id, label, width = 432, height = 270, open, angle }: {
  id: string; label: string; width?: number; height?: number; open?: number; angle?: number;
}) {
  return <canvas data-preview={id} data-open={open} data-angle={angle} className={s.preview} role="img" aria-label={label}
    width={width} height={height}>{label}</canvas>;
}

function Soundtrack() {
  const [params] = useSearchParams();
  const query = params.toString();
  return <section id="audio" className={s.section}>
    <h2>Soundtrack</h2>
    <p>Inspect the soundtrack, audition individual DAYBREAK instruments or export the official mix as WAV.</p>
    <Link to={'/debug/audio/' + (query ? '?' + query : '')}>Open Audio Inspector</Link>
    <p><Link to="/debug/audio/?vol=descent">DESCENT — CONTROL</Link> · <Link to="/debug/audio/?vol=orbit">ORBIT — STARWAKE</Link></p>
  </section>;
}

function DaybreakChart() {
  const volume = volumeById('daybreak');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const chart = chartFor(volume, difficulty);
  const reference = referenceFor(volume);
  const duration = volume.beats * 60 / volume.bpm;
  let start = 0;
  return <details>
    <summary>DAYBREAK chart and ending</summary>
    <label>Chart difficulty <select value={difficulty} onChange={e => setDifficulty(e.currentTarget.value as typeof difficulty)}>
      <option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option>
    </select></label>
    <ul>{volume.sections.map(section => {
      const from = start;
      start += section.beats;
      const gates = chart.filter(gate => gate.section === section.name);
      return <li key={section.name}>{section.name} · beats {from}–{start} · {gates.length} gates
        {gates.length > 0 && <ul>{gates.map(gate => <li key={gate.beat}>
          Beat {gate.beat} · station {reference.station(gate.beat, 'standard').toFixed(1)} · {gateDescription(gate.kind).label}
          {isDaybreakGate(gate.kind) && <> · {daybreakGates[gate.kind].openings[gate.sector]}</>}
        </li>)}</ul>}
      </li>;
    })}</ul>
    <p>Song end · {duration} s · cruise station {reference.station(volume.beats, 'standard').toFixed(1)}</p>
    <a href={`/?vol=daybreak&diff=${difficulty}&t=${duration + .8}&align=1&god=0&dbg=1`}>Inspect the result</a>
  </details>;
}

export default function DebugOverview() {
  const root = useRef<HTMLElement>(null);
  const models = useRef<ModelPreviews>(null);
  const [angle, setAngle] = useState(initialAngle);
  const [gateAngle, setGateAngle] = useState(0);
  const [orbitAngle, setOrbitAngle] = useState(0);
  const [orbitClose, setOrbitClose] = useState(false);
  const [gateOpenings, setGateOpenings] = useState<Partial<Record<GateKind, number>>>({});
  useEffect(() => { models.current?.drawGates(gateAngle, true, orbitClose); }, [gateAngle, orbitAngle, gateOpenings, orbitClose]);
  const [modelStatus, setModelStatus] = useState('Loading the 3D previews…');
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
    let viewer: ModelPreviews | undefined;
    let releaseMaterials: (() => void) | undefined;
    void Promise.all([import('../game/debug/previews.client'), import('../game/graphics/materials/library.client')]).then(([
      { ModelPreviews, renderRawSurfaces, renderRawChannel }, { MaterialLibrary },
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
    }).catch(() => {
      if (stale) return;
      setModelStatus('The 3D preview module could not load. Reload to try again.');
      setMaterialStatus('Material previews unavailable.');
    });
    return () => {
      stale = true;
      viewer?.dispose();
      releaseMaterials?.();
      models.current = null;
    };
  }, []);

  return (
    <section ref={root} className={s.page} aria-label="Legacy experiments">
      <header className={s.header}>
        <nav aria-label="Debug sections">
          <a href="#pickups">Pickups</a><Link to="/debug/worlds/">Worlds</Link><a href="#gates">Gates</a>
          <a href="#materials">Materials</a><a href="#effects">Effects</a><Link to="/debug/lighting/">Lighting</Link>
          <a href="#outro">Ending</a><a href="#ui-states">UI States</a><a href="#audio">Audio</a>
        </nav>
      </header>
      <div className={s.content}>
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

        <section className={s.section}>
          <h2>World and lighting previews</h2>
          <p><Link to="/debug/worlds/">Explore the four live worlds</Link> or <Link to="/debug/lighting/">inspect their lighting scores</Link>.</p>
          <DaybreakChart />
        </section>

        <section id="gates" className={s.section}>
          <h2>Gate library</h2>
          <p>Inspect the gate geometry and its openings.</p>
          <div className={s.gateLibrary}>
            {catalog.map(({ volume, gates }) => (
              <div key={volume.id} id={`gates-${volume.id}`} className={gates.length > 1 ? s.gateGroupWide : s.gateGroup}>
                <h3>{volume.subtitle} / {volume.name}</h3>
                {(volume.id === 'daybreak' || volume.id === 'orbit') && <div className={s.angle}>
                  <label htmlFor={`debug-gate-angle-${volume.id}`}>{volume.name} specimen angle</label>
                  <input id={`debug-gate-angle-${volume.id}`} type="range" min={volume.id === 'orbit' ? -80 : -45} max={volume.id === 'orbit' ? 80 : 45} value={volume.id === 'orbit' ? orbitAngle : gateAngle} disabled={!modelReady}
                    onChange={event => (volume.id === 'orbit' ? setOrbitAngle : setGateAngle)(event.currentTarget.valueAsNumber)} />
                  <output htmlFor={`debug-gate-angle-${volume.id}`}>{volume.id === 'orbit' ? orbitAngle : gateAngle}°</output>
                </div>}
                {volume.id === 'orbit' && <label className={s.surfaceSelect}>ORBIT specimen framing <select
                  aria-label="ORBIT specimen framing" value={orbitClose ? 'close' : 'full'} disabled={!modelReady}
                  onChange={event => setOrbitClose(event.currentTarget.value === 'close')}>
                  <option value="full">Full gate</option><option value="close">Close surface and throat</option>
                </select></label>}
                <div className={gates.length > 1 ? s.trio : s.gateSingle}>
                  {gates.map(kind => {
                    const { label, note } = gateDescription(kind);
                    const glass = isDaybreakGate(kind);
                    const openings = glass ? daybreakGates[kind].openings
                      : isDescentGate(kind) ? descentExamples[kind].map(example => example.label)
                      : isOrbitGate(kind) ? orbitPresets[kind].map(preset => preset.label) : undefined;
                    const open = openings ? gateOpenings[kind] ?? (kind === 'daybreak-crystal' ? -1 : 0) : undefined;
                    return (
                      <figure key={kind} className={s.card}>
                        <Preview id={kind} label={`${label} gate`} open={open} angle={isOrbitGate(kind) ? orbitAngle : undefined} />
                        <figcaption className={s.caption}>
                          <strong className={s.gateName}>{label}</strong><p>{note}</p>
                          {openings && openings.length > 1 && <label className={s.surfaceSelect}>{label} opening <select
                            aria-label={`${label} opening`} value={open}
                            disabled={!modelReady} onChange={event => {
                              const value = Number(event.currentTarget.value);
                              setGateOpenings(previous => ({ ...previous, [kind]: value }));
                            }}>
                            {glass && <option value={-1}>Complete layout</option>}
                            {openings.map((name, index) => <option key={name} value={index}>{index + 1} · {name}</option>)}
                          </select></label>}
                          {isOrbitGate(kind) && <p>{orbitPresets[kind][open ?? 0].holes.length} physical, traversable openings.
                            {' '}Glass thickness 0.38; the bevel expands toward the faces, leaving the collision throat unchanged.</p>}
                        </figcaption>
                      </figure>
                    );
                  })}
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

        <EndSequenceStudio />
        <UIStateStudio />


        <Soundtrack />
      </div>
    </section>
  );
}
