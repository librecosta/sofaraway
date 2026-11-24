import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { VolumeId } from '../../game/contracts';
import { channelNames, effectIds, effectPresets, surfaceChannels, surfaceIds, surfacePresets } from '../../game/graphics/materials/presets';
import type { SurfaceChannel } from '../../game/graphics/materials/presets';
import { explorerHref, explorerSource } from './explorer-catalog';
import { SpecimenCanvas, SpecimenStatus, useSpecimens } from './Specimens';
import s from '../../styles/explorer-lab.module.css';

const inWorld = {
  elsewhere: ['The floor, panel and alloy specimens share one lighting rig.', 'app/game/graphics/materials/library.client.ts'],
  daybreak: ['The Skyglass exterior renders transparent cabin glass, a procedural cloud sea and branching cirrus. Inspect these in the live Skyglass scene.', 'app/game/graphics/daybreak-exterior.client.ts'],
  descent: ['The facility renders beveled gate glass and stage-specific fixture colors. Inspect its gate specimens or walk through the facility lighting.', 'app/game/graphics/descent-glass.ts'],
  orbit: ['The asteroid field shares rock surface shaders across scales. Its apertures use beveled glass, while nebula dust and gas are rendered with their own optical model.', 'app/game/graphics/orbit-rock-surface.ts'],
} as const;

export default function MaterialLab({ volume }: { volume: VolumeId }) {
  const [params, setParams] = useSearchParams();
  const [requestedChannel, setChannel] = useState<SurfaceChannel>('color');
  const [scanning, setScanning] = useState(false);
  const { root, model, raw, status } = useSpecimens('materials');
  const surface = surfaceIds.find(id => id === params.get('material')) ?? surfaceIds[0];
  const channels = surfaceChannels(surface);
  const channel = channels.includes(requestedChannel) ? requestedChannel : 'color';
  const inspected = surfacePresets[surface];
  const [description, source] = inWorld[volume];

  useEffect(() => { raw?.(surface, channel); }, [raw, surface, channel]);
  useEffect(() => { model.current?.setScan(scanning); }, [model, scanning]);

  return <section ref={root} className={s.preview} aria-label="Material specimens">
    <section id="materials" className={s.preview}>
      <header className={s.notes}>
        <h2>ELSEWHERE corridor surfaces</h2>
        <p>{description}</p>
        <div className={s.actions}>
          <Link to={explorerHref('worlds', volume)}>Open {volume.toUpperCase()} in Worlds</Link>
          {volume !== 'elsewhere' && <Link to={explorerHref('gates', volume)}>Inspect {volume.toUpperCase()} gate glass</Link>}
          <a href={explorerSource(source)}>Volume material source</a>
        </div>
      </header>
      <SpecimenStatus status={status} />
      {status === 'unavailable' && <p>Lit previews unavailable. The cards show base color, and the raw channels remain available.</p>}
      <div className={s.specimenGrid} data-layout="surface">
        {surfaceIds.map(id => {
          const { name, detail, metalness, roughness } = surfacePresets[id];
          return <figure className={s.specimen} key={id}>
            <SpecimenCanvas id={id} label={`${name} material preview`} />
            <figcaption className={s.specimenCaption}>
              <h3>{name}</h3><p>{detail}</p>
              <p>Metalness {metalness.toFixed(2)} · Roughness {roughness.toFixed(2)}</p>
            </figcaption>
          </figure>;
        })}
      </div>
      <section className={s.inspection} aria-labelledby="raw-channels">
        <div>
          <h2 id="raw-channels">Inspect raw channels</h2>
          <p>Height generates the texture normals. This view stretches the height range so shallow grooves stay visible.</p>
          <fieldset className={s.group}>
            <legend>Texture sample</legend>
            <label>Surface <select value={surface} disabled={!raw} onChange={e => {
              const id = surfaceIds.find(id => id === e.currentTarget.value)!;
              if (!surfaceChannels(id).includes(channel)) setChannel('color');
              const next = new URLSearchParams(params);
              next.set('material', id);
              setParams(next, { replace: true, preventScrollReset: true });
            }}>{surfaceIds.map(id => <option key={id} value={id}>{surfacePresets[id].name}</option>)}</select></label>
            <div role="group" aria-label="Texture channel" className={s.actions}>
              {channels.map(id => <button key={id} type="button" disabled={!raw} aria-pressed={channel === id}
                onClick={() => setChannel(id)}>{channelNames[id]}</button>)}
            </div>
          </fieldset>
          <p>{inspected.resolution}² texels · Tile {inspected.tile.map(n => n.toFixed(2)).join(' × ')} world units</p>
        </div>
        <SpecimenCanvas id="surface-channel" label={`${inspected.name}: ${channelNames[channel]}`} square />
      </section>
    </section>
    <section id="effects" className={s.preview}>
      <h2>Effect materials</h2>
      <div className={s.specimenGrid}>
        {effectIds.map(id => <figure className={s.specimen} key={id}>
          <SpecimenCanvas id={id} label={`${effectPresets[id].name} effect preview`} />
          <figcaption className={s.specimenCaption}>
            <h3>{effectPresets[id].name}</h3><p>{effectPresets[id].detail}</p>
            {id === 'hologram-panel-cyan' && <button type="button" disabled={status !== 'ready'} aria-pressed={scanning}
              onClick={() => setScanning(!scanning)}>Animate scan</button>}
          </figcaption>
        </figure>)}
      </div>
    </section>
  </section>;
}
