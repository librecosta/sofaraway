import { Link, useLocation, useOutletContext } from 'react-router';
import type { ExplorerContext } from '../components/explorer/ExplorerLayout';
import { explorerHref, explorerPages, explorerSource, explorerTopicsContent } from '../components/explorer/explorer-catalog';
import { explorerPageAt, type ExplorerTopic } from '../components/explorer/explorer-paths';
import s from '../styles/explorer.module.css';

export const meta = ({ location }: { location: { pathname: string } }) => [
  { title: `SoFarAway / ${explorerPages[explorerPageAt(location.pathname)].title}` },
  { name: 'robots', content: 'noindex' },
];

export default function ExplorerTopicPage() {
  const { pathname } = useLocation();
  const topic = explorerPageAt(pathname) as Exclude<ExplorerTopic, 'worlds' | 'lighting'>;
  const { selectedVolume } = useOutletContext<ExplorerContext>();

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
          to={experiment.anchor === 'volumes' ? explorerHref('worlds', selectedVolume)
            : explorerHref('legacy', selectedVolume, topic === 'gates' && selectedVolume ? `gates-${selectedVolume}` : experiment.anchor)}>
          <h3>{experiment.name} <span aria-hidden="true">↗</span></h3>
          <p>{experiment.summary}</p>
        </Link>)}
      </div>
    </section>
  </article>;
}
