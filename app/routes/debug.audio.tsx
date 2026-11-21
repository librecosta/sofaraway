import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AudioInspector } from '../components/audio-inspector/AudioInspector';
import { timecode } from '../components/audio-inspector/Timeline';
import { VOLUMES, volumeById } from '../game/core/volumes';
import { inspectorScore } from '../game/debug/audio/track-adapter';
import s from '../styles/audio-inspector.module.css';

export const meta = () => [
  { title: 'SoFaraway / Audio Inspector' },
  { name: 'robots', content: 'noindex' },
];

export default function AudioInspectorPage() {
  const [params, changeParams] = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const requested = hydrated ? params.get('vol') : null;
  const volume = volumeById(requested ?? 'daybreak');
  const arrangement = hydrated && volume.id === 'orbit' && params.get('arrangement') === 'm1' ? 'm1' : 'original';
  const score = useMemo(() => inspectorScore(volume,arrangement), [volume,arrangement]);
  const comparisonPosition = useRef(0);
  const comparisonVolume = useRef(volume.id);
  const [exportStatus, setExportStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const lifetime = useRef<AbortController>(null);
  const downloadUrl = useRef<string>(undefined);
  useEffect(() => {
    setHydrated(true);
    setExporting(false);
    setExportStatus('');
    const abort = new AbortController();
    lifetime.current = abort;
    return () => {
      abort.abort();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, [score.key]);

  async function download() {
    const signal = lifetime.current?.signal;
    if (!signal || exporting) return;
    setExporting(true);
    setExportStatus('Rendering ' + (volume.soundtrack?.title ?? volume.name) + '…');
    try {
      const { exportSoundtrack } = await import('../game/debug/audio-export.client');
      const { inspectorOffline } = await import('../game/debug/audio/offline.client');
      signal.throwIfAborted();
      const { blob, duration } = await inspectorOffline(signal, async () => arrangement === 'm1'
        ? (await import('../game/audio/orbit-m1-export.client')).exportOrbitM1(signal)
        : exportSoundtrack(volume, Number(params.get('secs')), signal));
      signal.throwIfAborted();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      const url = downloadUrl.current = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = arrangement === 'm1' ? 'ORBIT-M1-MELODY-FIRST-FULL.wav'
        : volume.music === 'starwake' ? 'ORBIT-STARWAKE-FULL.wav'
        : volume.music === 'control' ? 'DESCENT-CONTROL.wav'
        : 'sofaraway-' + volume.id + '.wav';
      link.click();
      setExportStatus(`Done · ${(blob.size / 1048576).toFixed(1)} MB · ${duration.toFixed(1)} s`);
    } catch (error) {
      if (!signal.aborted) setExportStatus(error instanceof Error ? error.message : 'Soundtrack render failed.');
    } finally {
      if (!signal.aborted) setExporting(false);
    }
  }

  return <main className={s.page}>
    <div className={s.workspace}>
      <header className={s.header}>
        <div>
          <Link to="/debug/" className={s.back}>SoFarAway</Link>
          <span className={s.breadcrumb}> / Audio Inspector</span>
          <h1>{volume.music === 'starwake' ? volume.soundtrack!.title : volume.name}</h1>
          {volume.id === 'orbit' && <p>STARWAKE · 96 bars · {arrangement === 'm1'
            ? 'M1 Melody First · Audition candidate; gameplay uses Original' : 'Original Melodic Cosmic Electronica'}</p>}
        </div>
        <div className={s.metadata}>
          {volume.soundtrack && <span>{volume.soundtrack.title}</span>}
          <span>{volume.bpm} BPM</span><span>{volume.beats} beats</span><span>{timecode(score.duration)}</span>
          <label className={s.volume}>Volume
            <select aria-label="Volume" value={volume.id} disabled={!hydrated || exporting} onChange={event => {
              const next = new URLSearchParams(params);
              next.set('vol', event.currentTarget.value);
              next.delete('arrangement');
              comparisonPosition.current = 0;
              setExportStatus('');
              changeParams(next, { preventScrollReset: true });
            }}>
              {VOLUMES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {volume.id === 'orbit' && <label className={s.volume}>Arrangement
            <select aria-label="Arrangement" value={arrangement} disabled={!hydrated || exporting} onChange={event => {
              const next = new URLSearchParams(params);
              if (event.currentTarget.value === 'm1') next.set('arrangement','m1');
              else next.delete('arrangement');
              changeParams(next,{preventScrollReset:true});
            }}>
              <option value="original">Original</option><option value="m1">M1 — Melody First</option>
            </select>
          </label>}
        </div>
      </header>
      <AudioInspector key={score.key} score={score}
        initialPosition={comparisonVolume.current === volume.id ? comparisonPosition.current : 0}
        onPosition={time => { comparisonVolume.current=volume.id; comparisonPosition.current=time; }} />
      <div className={s.export}>
        <button type="button" disabled={!hydrated || exporting} onClick={() => void download()}>Render to WAV</button>
        <span role="status" id="audio-status">{exportStatus}</span>
      </div>
    </div>
  </main>;
}
