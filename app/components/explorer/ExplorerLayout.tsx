import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router';
import type { VolumeId } from '../../game/contracts';
import { explorerHref, explorerPages, explorerVolume, explorerVolumeIds, explorerVolumes, laboratoryPages } from './explorer-catalog';
import { explorerPageAt } from './explorer-paths';
import s from '../../styles/explorer.module.css';

export type ExplorerContext = { volume: VolumeId; selectedVolume?: VolumeId };

export function ExplorerLayout() {
  const { hash, pathname } = useLocation();
  const page = explorerPageAt(pathname);
  const wide = page === 'audio' || page === 'legacy';
  const [params, setParams] = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const requested = hydrated ? params.get('vol') : null;
  const selectedVolume = requested === null ? (page === 'audio' && hydrated ? 'daybreak' : undefined) : explorerVolume(requested);
  const volume = selectedVolume ?? 'elsewhere';

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash, pathname]);

  return <div className={s.shell} data-workspace={page === 'audio' ? 'audio' : wide ? 'wide' : undefined}>
    <a className={s.skip} href="#explorer-main">Skip to content</a>
    <header className={s.header}>
      <div>
        <nav className={s.breadcrumbs} aria-label="Breadcrumb">
          <span className={s.brand}>SoFarAway</span><span aria-hidden="true">/</span>
          {page === 'overview'
            ? <><span>Explorer</span><span aria-hidden="true">/</span><span aria-current="page">Overview</span></>
            : <><Link to={explorerHref('overview', selectedVolume)}>Explorer</Link><span aria-hidden="true">/</span>
              <span aria-current="page">{explorerPages[page].label}</span></>}
        </nav>
        {page !== 'overview' && <h1>{explorerPages[page].title}</h1>}
      </div>
      <div className={s.headerActions}>
        {page !== 'overview' && !wide && <label className={s.volumeSelect}>Volume
          <select aria-label="Volume" value={volume} disabled={!hydrated} onChange={event => {
            const next = new URLSearchParams(params);
            next.set('vol', event.currentTarget.value);
            setParams(next, { preventScrollReset: true });
          }}>
            {explorerVolumeIds.map(id => <option key={id} value={id}>{explorerVolumes[id].name}</option>)}
          </select>
        </label>}
        <Link className={s.back} to={selectedVolume ? `/?vol=${selectedVolume}` : '/'}>Back to game <span aria-hidden="true">↗</span></Link>
      </div>
    </header>
    <nav className={s.navigation} aria-label="Explorer">
      {(['overview', ...laboratoryPages] as const).map(id =>
        <NavLink key={id} to={explorerHref(id, selectedVolume)} end>{explorerPages[id].label}</NavLink>)}
    </nav>
    <main className={s.main} id="explorer-main" tabIndex={-1}>
      <Outlet context={{ volume, selectedVolume } satisfies ExplorerContext} />
    </main>
  </div>;
}
