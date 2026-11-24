import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AudioInspector } from '../components/audio-inspector/AudioInspector';
import { timecode } from '../components/audio-inspector/Timeline';
import { explorerSource } from '../components/explorer/explorer-catalog';
import { VOLUMES, volumeById } from '../game/core/volumes';
import { downloadWav } from '../game/debug/audio/download.client';
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
  const score = useMemo(() => inspectorScore(volume), [volume]);
  const [exportStatus, setExportStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const lifetime = useRef<AbortController>(null);
  const releaseDownload = useRef<() => void>(undefined);
  useEffect(() => {
    setHydrated(true);
    setExporting(false);
    setExportStatus('');
    const abort = new AbortController();
    lifetime.current = abort;
    return () => {
      abort.abort();
      releaseDownload.current?.();
      releaseDownload.current = undefined;
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
      const { blob, duration } = await inspectorOffline(signal, () => exportSoundtrack(volume, Number(params.get('secs')), signal));
      signal.throwIfAborted();
      const filename = volume.music === 'starwake' ? 'ORBIT-STARWAKE-FULL.wav'
        : volume.music === 'control' ? 'DESCENT-CONTROL.wav'
        : 'sofaraway-' + volume.id + '.wav';
      releaseDownload.current?.();
      releaseDownload.current = downloadWav(blob, filename);
      setExportStatus(`Done · ${(blob.size / 1048576).toFixed(1)} MB · ${duration.toFixed(1)} s`);
    } catch (error) {
      if (!signal.aborted) setExportStatus(error instanceof Error ? `Export failed. ${error.message}` : 'Soundtrack export failed.');
    } finally {
      if (!signal.aborted) setExporting(false);
    }
  }

  return <section id="audio" className={s.page} aria-label="Soundtrack workspace">
    <div className={s.workspace}>
      <header className={s.header}>
        <div>
          <h2>{volume.music === 'starwake' ? volume.soundtrack!.title : volume.name}</h2>
          {volume.id === 'orbit' && <p>STARWAKE · 96 bars · Melodic Cosmic Electronica</p>}
        </div>
        <div className={s.metadata}>
          {volume.soundtrack && <span>{volume.soundtrack.title}</span>}
          <span>{volume.bpm} BPM</span><span>{volume.beats} beats</span><span>{timecode(score.duration)}</span>
          <label className={s.volume}>Volume
            <select aria-label="Volume" value={volume.id} disabled={!hydrated} onChange={event => {
              const next = new URLSearchParams(params);
              next.set('vol', event.currentTarget.value);
              next.delete('arrangement');
              setExportStatus('');
              changeParams(next, { preventScrollReset: true });
            }}>
              {VOLUMES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

        </div>
      </header>
      {hydrated ? <AudioInspector key={score.key} score={score} /> : <p role="status">Loading the audio inspector…</p>}
      <div className={s.export}>
        <button type="button" disabled={!hydrated || exporting} onClick={() => void download()}>Render to WAV</button>
        <a href={explorerSource('app/game/debug/audio/track-adapter.ts')}>Track source</a>
        <a href={explorerSource('app/game/debug/audio-export.client.ts')}>WAV export source</a>
        <span role="status" id="audio-status">{exportStatus}</span>
      </div>
      <p className={s.exportHint}>The WAV renderer exports the soundtrack mix. Use the stem export to download an individual instrument.</p>
    </div>
  </section>;
}
