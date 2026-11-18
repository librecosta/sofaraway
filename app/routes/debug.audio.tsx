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
  const orbit = requested === 'orbit';
  const volume = volumeById(orbit ? 'daybreak' : requested ?? 'daybreak');
  const score = useMemo(() => orbit ? null : inspectorScore(volume), [orbit, volume]);
  const [exportStatus, setExportStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const lifetime = useRef<AbortController>(null);
  const downloadUrl = useRef<string>(undefined);
  useEffect(() => {
    setHydrated(true);
    const abort = new AbortController();
    lifetime.current = abort;
    return () => {
      abort.abort();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, []);

  async function download() {
    const signal = lifetime.current?.signal;
    if (!signal || exporting || !score) return;
    setExporting(true);
    setExportStatus('Rendering ' + (volume.soundtrack?.title ?? volume.name) + '…');
    try {
      const { exportSoundtrack } = await import('../game/debug/audio-export.client');
      signal.throwIfAborted();
      const { blob, duration } = await exportSoundtrack(volume, Number(params.get('secs')), signal);
      signal.throwIfAborted();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      const url = downloadUrl.current = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = volume.music === 'control' ? 'DESCENT-CONTROL.wav' : 'sofaraway-' + volume.id + '.wav';
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
          <h1>{orbit ? 'ORBIT' : volume.name}</h1>
        </div>
        <div className={s.metadata}>
          {score && <>{volume.soundtrack && <span>{volume.soundtrack.title}</span>}
            <span>{volume.bpm} BPM</span><span>{volume.beats} beats</span><span>{timecode(score.duration)}</span></>}
          <label className={s.volume}>Volume
            <select aria-label="Volume" value={orbit ? 'orbit' : volume.id} disabled={!hydrated || exporting} onChange={event => {
              const next = new URLSearchParams(params);
              next.set('vol', event.currentTarget.value);
              setExportStatus('');
              changeParams(next, { preventScrollReset: true });
            }}>
              {VOLUMES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              <option value="orbit">ORBIT</option>
            </select>
          </label>
        </div>
      </header>
      {score ? <><AudioInspector key={volume.id} score={score} />
      <div className={s.export}>
        <button type="button" disabled={!hydrated || exporting} onClick={() => void download()}>Render to WAV</button>
        <span role="status" id="audio-status">{exportStatus}</span>
      </div></> : <p>ORBIT has no soundtrack in the ASTRAL BELT development preview. <Link to="/?vol=orbit">Open flight preview</Link>.</p>}
    </div>
  </main>;
}
