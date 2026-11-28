import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GameDialog } from '../app/components/GameDialog';
import type { RunSettlement } from '../app/game/runtime/run-settlement';
import { usePlayerText } from '../app/i18n/PlayerLocale';
import { classes as c } from '../app/styles/classes';
import { rankFailure } from './leaderboard-contract';
import { shareActions } from './player-services';
import type { ShareAction, SharePlatform } from './player-services';
import { requestTimeout } from './request-budget';
import { canShareResult, drawResultCard, resultCardDetails } from './result-card';
import './player-services.css';

const en = {
  title: 'SHARE RESULT', sharePicture: 'SHARE CARD', saveImageToAlbum: 'SAVE TO ALBUM', share: 'SHARE TOY',
  saved: 'Card saved.', shared: 'Share action completed.', failed: 'Bilibili could not complete the action.',
  permission: 'Bilibili did not grant permission.', timeout: 'The request timed out.', unavailable: 'Card preview is unavailable.',
};
const zh: typeof en = {
  title: '分享成绩', sharePicture: '分享成绩卡', saveImageToAlbum: '保存到相册', share: '分享玩具',
  saved: '成绩卡已保存。', shared: '分享操作已完成。', failed: '哔哩哔哩未能完成此操作。',
  permission: '哔哩哔哩未授予权限。', timeout: '请求已超时。', unavailable: '无法预览成绩卡。',
};
const noSubscription = () => () => {};
const noSession = () => 0;
type Notice = 'saved' | 'shared' | 'failed' | 'permission' | 'timeout';

export function ResultShareButton({ run, open }: { run: RunSettlement; open(): void }) {
  const { text } = usePlayerText();
  if (!canShareResult(run)) return null;
  return <button type="button" className="toy-rank-control toy-result-share-action" data-act="share-result" onClick={open}>
    {(text.locale === 'zh-CN' ? zh : en).title}
  </button>;
}

export function ResultSharePanel({ run, platform, close }: { run: RunSettlement; platform?: SharePlatform; close(): void }) {
  const { text } = usePlayerText();
  const copy = text.locale === 'zh-CN' ? zh : en;
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [actions, setActions] = useState<readonly ShareAction[]>([]);
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const active = useRef(false);
  const session = useSyncExternalStore(platform?.subscribeSession ?? noSubscription, platform?.session ?? noSession);

  useEffect(() => {
    let current = true;
    const draw = () => setDrawn(!!ref.current && drawResultCard(ref.current, run, text));
    draw();
    void document.fonts?.ready.then(() => { if (current) draw(); });
    return () => { current = false; };
  }, [run, text]);

  useEffect(() => {
    const scope = new AbortController();
    lifetime.current = scope;
    setActions([]);
    setNotice(undefined);
    if (platform) {
      void Promise.all(shareActions.map(async action => await platform.supportsShare(action, scope.signal).catch(() => false) ? [action] : []))
        .then(found => { if (!scope.signal.aborted) setActions(found.flat()); });
    }
    return () => scope.abort();
  }, [platform, session]);

  function share(action: ShareAction) {
    const scope = lifetime.current;
    if (active.current || !platform || !scope || scope.signal.aborted || !ref.current || !actions.includes(action)) return;
    active.current = true;
    setBusy(true);
    setNotice(undefined);
    const operation = new AbortController();
    const stop = () => {
      clearTimeout(timeout);
      operation.abort();
    };
    const timeout = setTimeout(() => {
      operation.abort();
      setNotice('timeout');
    }, requestTimeout);
    scope.signal.addEventListener('abort', stop, { once: true });
    void (async () => {
      const base64 = action === 'share' ? '' : ref.current!.toDataURL('image/png').split(',')[1];
      await platform.shareResult(action, base64, operation.signal);
      if (!operation.signal.aborted) setNotice(action === 'saveImageToAlbum' ? 'saved' : 'shared');
    })().catch(error => {
      if (!operation.signal.aborted) setNotice(rankFailure(error) === 'permission' ? 'permission' : 'failed');
    }).finally(() => {
      clearTimeout(timeout);
      scope.signal.removeEventListener('abort', stop);
      active.current = false;
      if (!lifetime.current?.signal.aborted) setBusy(false);
    });
  }

  const details = resultCardDetails(run, text);
  const description = ['SoFarAway', 'LibreCosta', details.volume, details.flight, details.outcome, details.score, details.rank,
    ...details.metrics.flat()].join(' · ');
  return <GameDialog id="toy-result-share" title={copy.title} dismiss={close}>
    <div className={c('panel') + ' toy-service-panel toy-share-panel'}>
      <header className="toy-rank-header">
        <h2>{copy.title}</h2>
        <button type="button" className="toy-rank-control toy-rank-icon-action" onClick={close} aria-label={text.t('close')}>
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <canvas ref={ref} role="img" aria-label={description} />
      {actions.length > 0 && <div className="toy-share-actions">
        {actions.map(action => <button type="button" key={action} className="toy-rank-control" disabled={busy || !drawn}
          onClick={() => share(action)}>{copy[action]}</button>)}
      </div>}
      <div role="status" className="toy-service-notice">{!drawn ? copy.unavailable : notice ? copy[notice] : ''}</div>
    </div>
  </GameDialog>;
}
