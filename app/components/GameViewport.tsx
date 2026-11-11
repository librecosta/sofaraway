import { useEffect, useRef, useState } from 'react';
import styles from '../styles/viewport.module.css';

export function GameViewport() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading game viewport');

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const element = host.current!;
    void import('../game/graphics/viewport.client').then(({ mountViewport }) => {
      if (disposed) return;
      cleanup = mountViewport(element);
      setStatus('Game viewport ready');
    }).catch(() => {
      if (!disposed) setStatus('This device could not initialize WebGL2.');
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <main className={styles.viewport}>
      <div ref={host} />
      <h1>SOFARAWAY</h1>
      <p>Thread the gates, ride the beat. A procedural rhythm runner by LibreCosta.</p>
      <p role="status">{status}</p>
    </main>
  );
}
