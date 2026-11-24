import { Link, useLocation, useOutletContext } from 'react-router';
import type { ExplorerContext } from '../components/explorer/ExplorerLayout';
import { explorerHref, explorerPages, explorerSource, explorerTopicsContent, explorerVolumes } from '../components/explorer/explorer-catalog';
import { explorerPageAt, type ExplorerTopic } from '../components/explorer/explorer-paths';
import s from '../styles/explorer.module.css';

export const meta = ({ location }: { location: { pathname: string } }) => [
  { title: `SoFarAway / ${explorerPages[explorerPageAt(location.pathname)].title}` },
  { name: 'robots', content: 'noindex' },
];

export default function ExplorerTopicPage() {
  const { pathname } = useLocation();
  const topic = explorerPageAt(pathname) as ExplorerTopic;
  const { volume, selectedVolume } = useOutletContext<ExplorerContext>();
  const world = explorerVolumes[volume];

  if (topic === 'worlds') {
    return <article className={s.flow}>
      <figure className={s.worldFigure}>
        <img src={`/explorer/${volume}.webp`} width="768" height="432" alt={`In-game view of ${world.name}`} />
        <figcaption>Volume {world.number} · {world.name}</figcaption>
      </figure>
      <div className={s.topicIntro}>
        <h2>{world.name}</h2>
        <p>{world.summary}</p>
        <div className={s.links}>
          <Link className={s.action} to={explorerHref('legacy', volume, world.anchor)}>Open interactive world lab <span aria-hidden="true">→</span></Link>
          <Link to={explorerHref('legacy', volume, 'volumes')}>All volume previews</Link>
          <a href={explorerSource(world.source)}>View source</a>
        </div>
      </div>
    </article>;
  }

  const { method, source, experiments } = explorerTopicsContent[topic];
  return <article className={s.flow}>
    <header className={s.topicIntro}>
      <p className={s.lede}>{explorerPages[topic].summary}</p>
      <p>{method}</p>
      <div className={s.links}><a href={explorerSource(source)}>View source</a></div>
    </header>
    <section aria-labelledby="experiments-title">
      <h2 id="experiments-title" className={s.sectionTitle}>Interactive experiments</h2>
      <div className={s.labGrid}>
        {experiments.map(experiment => <Link key={experiment.anchor} className={s.labCard}
          to={explorerHref('legacy', selectedVolume, topic === 'gates' && selectedVolume ? `gates-${selectedVolume}` : experiment.anchor)}>
          <h3>{experiment.name} <span aria-hidden="true">↗</span></h3>
          <p>{experiment.summary}</p>
        </Link>)}
      </div>
    </section>
  </article>;
}
