import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { GameViewport } from '../components/GameViewport';
import { volumeById } from '../game/core/volumes';
import { webSettings } from '../game/runtime/settings.client';
import { WebCreditsPanel } from './WebCreditsPanel';
import { ShareToast, SocialLinks, useShareToast } from './WebMenuUtilities';
import { readWebLaunch } from './launch.client';
import './diagnostics.css';

export function WebGame({ compliance }: { compliance?: ReactNode }) {
  const [search, setSearch] = useSearchParams();
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const rawVolume = search.get('vol');
  const volume = volumeById(rawVolume).id;
  const debug = useRef<HTMLPreElement>(null);
  const { notice, showNotice } = useShareToast();
  const shareRequest = useRef(0);

  useEffect(() => {
    if (rawVolume !== 'drift') return;
    const params = new URLSearchParams(search);
    params.set('vol', volume);
    void navigate({ pathname, search: `?${params.toString()}`, hash }, { replace: true, preventScrollReset: true });
  }, [hash, navigate, pathname, rawVolume, search, volume]);

  useEffect(() => () => { shareRequest.current++; }, []);

  async function share() {
    const url = new URL(location.pathname, location.origin).href;
    const request = ++shareRequest.current;
    try {
      await navigator.clipboard.writeText(url);
      if (request === shareRequest.current) showNotice(true);
    } catch {
      if (request === shareRequest.current) showNotice(false);
    }
  }

  const write = (value: string) => { if (debug.current) debug.current.textContent = value; };
  return <GameViewport settings={webSettings} volume={volume} compliance={compliance}
    chooseVolume={id => {
      if (search.get('vol') === id) return;
      const params = new URLSearchParams(search);
      params.set('vol', id);
      setSearch(params, { preventScrollReset: true });
    }}
    launch={() => readWebLaunch(new URLSearchParams(location.search))}
    onQualityChanged={value => {
      if (!search.has('q')) return;
      const params = new URLSearchParams(search);
      params.set('q', value);
      setSearch(params, { replace: true, preventScrollReset: true });
    }}
    socialLinks={<SocialLinks />} share={() => void share()} shareNotice={<ShareToast notice={notice} />}
    renderCredits={(id, close) => <WebCreditsPanel volume={id} close={close} />}
    diagnostics={{
      output: <pre id="errbox" ref={debug} />, write,
      launchFailed(error) {
        if (search.get('dbg') === '1') write(String(error));
      },
    }} />;
}
