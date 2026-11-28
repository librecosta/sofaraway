import { useSyncExternalStore } from 'react';
import { DecodeButton } from '../app/components/DecodeButton';
import { GameDialog } from '../app/components/GameDialog';
import { VOLUMES } from '../app/game/core/volumes';
import { usePlayerText } from '../app/i18n/PlayerLocale';
import { classes as c } from '../app/styles/classes';
import type { CloudSaveClient } from './cloud-save';
import './player-services.css';

const en = {
  title: 'CLOUD SAVE', connect: 'AUTHORIZE AND SYNC', sync: 'SYNC BEST SCORES',
  consent: 'Connect to Bilibili to sync your personal Best scores. Only eligible Standard flights started after authorization can add new cloud scores.',
  ready: 'Personal Best scores synced.', empty: 'This account has no synced Best scores yet.',
  syncing: 'Syncing Best scores…', unsupported: 'Cloud save is unavailable here.',
  login: 'Sign in to Bilibili to sync.', permission: 'Bilibili did not provide an authorized account ID.',
  network: 'Could not reach Bilibili. Try again.', limited: 'Too many requests. Try again shortly.',
  timeout: 'Sync timed out. Try again.', invalid: 'The cloud save is damaged.',
  session: 'The Bilibili session changed. Sync again.', incompatible: 'The cloud save uses a different course or scoring version.',
  localStorage: 'This device could not save the synced scores.',
};
const zh: typeof en = {
  title: '云存档', connect: '授权并同步', sync: '同步最高分',
  consent: '连接哔哩哔哩以同步个人最高分。授权后开启的合格标准飞行才能新增云端成绩。',
  ready: '个人最高分已同步。', empty: '当前账号还没有已同步的最高分。',
  syncing: '正在同步最高分…', unsupported: '当前环境无法使用云存档。',
  login: '请登录哔哩哔哩后同步。', permission: '哔哩哔哩未提供已授权的账号标识。',
  network: '无法连接哔哩哔哩，请重试。', limited: '请求过于频繁，请稍后重试。',
  timeout: '同步超时，请重试。', invalid: '云存档数据已损坏。',
  session: '哔哩哔哩会话已切换，请重新同步。', incompatible: '云存档的关卡或计分版本与当前游戏不同。',
  localStorage: '当前设备无法保存同步的成绩。',
};

export function CloudSaveButton({ open }: { open(): void }) {
  const { text } = usePlayerText();
  return <DecodeButton className={c('btn', 'tiny')} data-act="cloud-save" onClick={open}
    label={text.locale === 'zh-CN' ? zh.title : en.title} />;
}

export function CloudSavePanel({ client, close }: { client: CloudSaveClient; close(): void }) {
  const { text } = usePlayerText();
  const copy = text.locale === 'zh-CN' ? zh : en;
  useSyncExternalStore(client.subscribe, client.getSnapshot);
  const view = client.view;
  const notice = view.status === 'failed' ? copy[view.reason] : view.status === 'syncing' ? copy.syncing
    : client.limited ? copy.limited : !client.available ? copy.unsupported : view.status === 'ready' ? copy.ready : '';
  return <GameDialog id="toy-cloud-dialog" title={copy.title} dismiss={close}>
    <div className={c('panel') + ' toy-service-panel'}>
      <header className="toy-rank-header">
        <h2>{copy.title}</h2>
        <button type="button" className="toy-rank-control toy-rank-icon-action" onClick={close} aria-label={text.t('close')}>
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <p>{copy.consent}</p>
      <button type="button" className="toy-rank-control" disabled={!client.canSync} onClick={client.sync}>
        {client.authorized ? copy.sync : copy.connect}
      </button>
      <div role="status" className="toy-service-notice">{notice}</div>
      {client.authorized && !client.scores.length && <p>{copy.empty}</p>}
      {client.scores.length > 0 && <div className="toy-cloud-bests">
        {VOLUMES.map(volume => {
          const entries = client.scores.filter(entry => entry.volume === volume.id);
          return entries.length > 0 && <section key={volume.id}>
            <h3>{volume.name}</h3>
            <dl>{entries.map(entry => <div key={entry.difficulty}>
              <dt>{text.difficulty(entry.difficulty)}</dt><dd>{text.score(entry.best)}</dd>
            </div>)}</dl>
          </section>;
        })}
      </div>}
    </div>
  </GameDialog>;
}
