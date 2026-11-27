import { Link, useOutletContext } from 'react-router';
import type { ExplorerContext } from '../components/explorer/ExplorerLayout';
import { explorerHref, explorerPages, explorerVolumeIds, explorerVolumes, laboratoryPages } from '../components/explorer/explorer-catalog';
import s from '../styles/explorer.module.css';

export default function ExplorerHome() {
  const { selectedVolume } = useOutletContext<ExplorerContext>();

  return <div className={s.flow}>
    <section className={s.hero} aria-labelledby="explorer-title">
      <div>
        <h1 id="explorer-title">Technical Explorer</h1>
        <p>Explore the music, graphics, physics and interaction behind four procedural worlds.</p>
        <Link className={s.action} to={explorerHref('worlds', selectedVolume)}>Explore the worlds <span aria-hidden="true">→</span></Link>
      </div>
    </section>
    <section aria-labelledby="worlds-title">
      <h2 id="worlds-title" className={s.sectionTitle}>Four volumes</h2>
      <div className={s.volumeGrid}>
        {explorerVolumeIds.map(id => {
          const world = explorerVolumes[id];
          return <Link key={id} className={s.volumeCard} to={explorerHref('worlds', id)}>
            <img src={`/explorer/${id}.webp`} width="768" height="432" alt="" />
            <div>
              <span className={s.volumeNumber} style={{ color: world.accent }}>Volume {world.number}</span>
              <h3>{world.name} <span aria-hidden="true">↗</span></h3>
              <p>{world.summary}</p>
            </div>
          </Link>;
        })}
      </div>
    </section>
    <section aria-labelledby="laboratories-title">
      <h2 id="laboratories-title" className={s.sectionTitle}>Laboratories</h2>
      <div className={s.labGrid}>
        {laboratoryPages.map(id => <Link key={id} to={explorerHref(id, selectedVolume)} className={s.labCard}>
          <h3>{explorerPages[id].title} <span aria-hidden="true">↗</span></h3>
          <p>{explorerPages[id].summary}</p>
        </Link>)}
      </div>
    </section>
  </div>;
}
