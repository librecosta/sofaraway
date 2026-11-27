import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useOutletContext, useSearchParams } from 'react-router';
import type { VolumeId } from '../game/contracts';
import type { ExplorerContext } from '../components/explorer/ExplorerLayout';
import { explorerPages, explorerSource, explorerTopicsContent } from '../components/explorer/explorer-catalog';
import { explorerPageAt, type ExplorerTopic } from '../components/explorer/explorer-paths';
import s from '../styles/explorer-lab.module.css';

const Gates = lazy(() => import('../components/explorer/GateLab'));
const Materials = lazy(() => import('../components/explorer/MaterialLab'));
const Gameplay = lazy(() => import('../components/explorer/GameplayLab'));
const Endings = lazy(() => import('../components/EndSequenceStudio').then(module => ({ default: module.EndSequenceStudio })));
const Interface = lazy(() => import('../components/UIStateStudio').then(module => ({ default: module.UIStateStudio })));

export const meta = ({ location }: { location: { pathname: string } }) => [
  { title: `SoFarAway / ${explorerPages[explorerPageAt(location.pathname)].title}` },
  { name: 'robots', content: 'noindex' },
];

export default function ExplorerTopicPage() {
  const { pathname, hash } = useLocation();
  const topic = explorerPageAt(pathname) as Exclude<ExplorerTopic, 'worlds' | 'lighting'>;
  const { volume, hydrated } = useOutletContext<ExplorerContext>();
  const { method, source } = explorerTopicsContent[topic];

  return <article className={s.lab}>
    {hydrated && <Suspense key={topic} fallback={<p role="status">Loading {explorerPages[topic].title}…</p>}>
      {topic === 'gates' && <Gates key={volume} volume={volume} />}
      {topic === 'materials' && <Materials volume={volume} />}
      {topic === 'gameplay' && <Gameplay key={volume} volume={volume} />}
      {topic === 'endings' && <EndingLab volume={volume} />}
      {topic === 'interface' && <Interface volume={volume} />}
      <ExperimentAnchor hash={hash} />
    </Suspense>}
    <section className={s.notes}>
      <h2>How it works</h2>
      <p>{method}</p>
      <div className={s.actions}>
        {Object.entries(source).map(([label, path]) => <a key={path} href={explorerSource(path)}>{label}</a>)}
      </div>
    </section>
  </article>;
}

function EndingLab({ volume }: { volume: VolumeId }) {
  const [open, setOpen] = useState(false);
  const [params] = useSearchParams();
  const configuration = ['diff', 'seed', 'route', 'stage', 'q', 'mode', 'beat', 'station', 'lights', 'movement']
    .map(key => params.get(key)).join(':');
  return <Endings key={`${volume}:${configuration}`} volumeId={volume} open={open} setOpen={setOpen} />;
}

export function ExperimentAnchor({ hash }: { hash: string }) {
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return null;
}
