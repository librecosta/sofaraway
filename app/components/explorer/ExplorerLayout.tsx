import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import type { VolumeId } from '../../game/contracts';
import { explorerHref, explorerPages, explorerVolume, explorerVolumeIds, explorerVolumes, laboratoryPages } from './explorer-catalog';
import { explorerPageAt, explorerPath, migratedExperiments } from './explorer-paths';
import s from '../../styles/explorer.module.css';

export type ExplorerContext = { volume: VolumeId; selectedVolume?: VolumeId; hydrated: boolean };

export function ExplorerLayout() {
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const page = explorerPageAt(pathname);
  const wide = page === 'audio';
  const [params, setParams] = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  const stateVolume = page === 'interface' ? explorerVolumeIds.find(id => id === params.get('state')) : undefined;
  const requested = hydrated ? params.get('vol') ?? stateVolume ?? null : null;
  const selectedVolume = requested === null ? (page === 'audio' && hydrated ? 'daybreak' : undefined) : explorerVolume(requested);
  const volume = selectedVolume ?? 'elsewhere';

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (page !== 'overview' && page !== 'legacy') return;
    const anchor = hash.slice(1);
    const migrated = migratedExperiments.get(anchor);
    if (migrated) {
      const [destination, fixedVolume] = migrated;
      let preserved = search;
      if (fixedVolume && new URLSearchParams(search).get('vol') !== fixedVolume) {
        const query = new URLSearchParams(search);
        query.set('vol', fixedVolume);
        preserved = '?' + query.toString();
      }
      void navigate({ pathname: explorerPath(destination), search: preserved, hash }, { replace: true });
    } else if (page === 'legacy') {
      void navigate({ pathname: explorerPath('overview'), search }, { replace: true });
    }
  }, [hash, navigate, page, search]);
  useEffect(() => {
    const changed = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (changed) main.current?.focus({ preventScroll: true });
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash, pathname]);

  useEffect(() => {
    const nav = navigation.current;
    if (!wide || !nav) return;
    const active = nav.querySelector('[aria-current="page"]');
    if (!active) return;
    const reveal = () => {
      const bounds = nav.getBoundingClientRect();
      const link = active.getBoundingClientRect();
      if (link.right > bounds.right - 6) nav.scrollLeft += link.right - bounds.right + 6;
      else if (link.left < bounds.left + 6) nav.scrollLeft -= bounds.left + 6 - link.left;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [wide]);

  return <div className={s.shell} data-workspace={wide ? 'audio' : undefined}>
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
    <nav ref={navigation} className={s.navigation} aria-label="Explorer">
      {(['overview', ...laboratoryPages] as const).map(id =>
        <NavLink key={id} to={explorerHref(id, selectedVolume)} end>{explorerPages[id].label}</NavLink>)}
    </nav>
    <main ref={main} className={s.main} id="explorer-main" tabIndex={-1}>
      <Outlet context={{ volume, selectedVolume, hydrated } satisfies ExplorerContext} />
    </main>
  </div>;
}
