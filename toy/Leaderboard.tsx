import { useEffect, useState, useSyncExternalStore } from 'react';
import { DecodeButton } from '../app/components/DecodeButton';
import { GameDialog } from '../app/components/GameDialog';
import type { GameSnapshot, VolumeId } from '../app/game/contracts';
import { volumeById } from '../app/game/core/volumes';
import type { RunSettlement } from '../app/game/runtime/run-settlement';
import { usePlayerText } from '../app/i18n/PlayerLocale';
import { classes as c } from '../app/styles/classes';
import { leaderboardNow } from './leaderboard-client';
import type { LeaderboardClient } from './leaderboard-client';
import { boards, competition, leaderboardVolumes } from './leaderboard-contract';
import type { Period } from './leaderboard-contract';
import './leaderboard.css';

const english = {
  title: 'Leaderboards', all: 'All time', week: 'This week', volume: 'Volume', period: 'Period',
  rules: 'Escape in Standard on Normal via the Main route, with no gates neutralized by recovery. Manual Boost and Auto Boost both count.',
  rank: 'Rank', player: 'Player', score: 'Score', myRank: 'My rank', myBest: 'My platform best', boardBest: 'Board leader',
  loading: 'Loading standings…', empty: 'No scores yet.', unranked: 'You have no score on this board.',
  refresh: 'Refresh', refreshSession: 'Refresh to load standings for this session.', anonymous: 'Bilibili player',
  submit: 'Submit score', retry: 'Retry submission', sending: 'Submitting score…', sent: 'Score submitted.',
  view: 'View leaderboard', current: 'Run total', local: 'Local best',
  unsupported: 'Leaderboards are unavailable in this environment.', submitUnavailable: 'Score submission is unavailable here.',
  login: 'Sign in to Bilibili to use your personal leaderboard.',
  permission: 'Bilibili did not grant access to this action.', network: 'Could not reach the leaderboard. Try again shortly.',
  limited: 'The leaderboard is busy. Try again shortly.', timeout: 'The leaderboard request timed out.',
  invalid: 'Bilibili did not accept this score.', session: 'The Bilibili session changed. Start a new flight to submit again.',
  waiting: 'Submission timed out. Waiting for Bilibili to finish the request.',
  mode: 'Only interactive Standard flights qualify.', difficulty: 'Only Normal flights qualify.',
  finish: 'Escape to qualify for this board.', route: 'Choose the Main route to qualify.',
  recovery: 'This flight had a gate neutralized by recovery.', policy: 'Only ordinary flights with a random seed qualify.',
  invalidScore: 'This score is outside the accepted range.',
};
const chinese = {
  title: '排行榜', all: '总榜', week: '本周', volume: '关卡', period: '榜单周期',
  rules: '以普通难度在标准模式走主路线成功撤离，且无障碍因恢复机制被中和。手动加速和全程加速均可上榜。',
  rank: '名次', player: '玩家', score: '得分', myRank: '我的排名', myBest: '我的平台最高分', boardBest: '榜首得分',
  loading: '正在加载排行榜…', empty: '暂无上榜成绩。', unranked: '你还未在此榜上榜。',
  refresh: '刷新', refreshSession: '请刷新，加载当前会话的排行榜。', anonymous: '哔哩哔哩玩家',
  submit: '提交成绩', retry: '重试提交', sending: '正在提交成绩…', sent: '成绩已提交。',
  view: '查看排行榜', current: '本场总分', local: '本地最高分',
  unsupported: '当前环境无法使用排行榜。', submitUnavailable: '当前环境无法提交成绩。',
  login: '登录哔哩哔哩后可使用个人排行榜功能。',
  permission: '哔哩哔哩未授权此操作。', network: '暂时无法连接排行榜，请稍后重试。',
  limited: '排行榜请求过多，请稍后重试。', timeout: '排行榜请求超时。',
  invalid: '哔哩哔哩未接受此成绩。', session: '哔哩哔哩会话已切换，请开始新一场飞行后提交。',
  waiting: '提交超时。正在等待哔哩哔哩结束上一次请求。',
  mode: '只有实际操作的标准模式场次可上榜。', difficulty: '只有普通难度的场次可上榜。',
  finish: '成功撤离后才可上榜。', route: '请选择主路线以取得上榜资格。',
  recovery: '本场有障碍因恢复机制被中和。', policy: '只有使用正常随机种子的飞行可上榜。',
  invalidScore: '此成绩超出可提交范围。',
} satisfies Record<keyof typeof english, string>;
const periods: readonly Period[] = ['all', 'week'];
const copyFor = (locale: string) => locale === 'zh-CN' ? chinese : english;

export function LeaderboardButton({ open }: { open(): void }) {
  const { text } = usePlayerText();
  return <DecodeButton className={c('btn', 'tiny')} data-act="leaderboard" onClick={open} label={copyFor(text.locale).title} />;
}

export function LeaderboardPanel({ client, initialVolume, close }: {
  client: LeaderboardClient; initialVolume: VolumeId; close(): void;
}) {
  const { text } = usePlayerText();
  const copy = copyFor(text.locale);
  const [volume, setVolume] = useState(initialVolume);
  const [period, setPeriod] = useState<Period>('all');
  useSyncExternalStore(client.subscribe, client.getSnapshot);
  const board = boards[volume];
  useEffect(() => { client.read(board, period); }, [client, board, period]);
  const { list, mine } = client.board(board, period);
  const rows = list?.status === 'ready' ? list.value : [];
  const personal = mine?.status === 'ready' ? mine.value : null;
  const loadingList = list?.status === 'loading';
  const loadingMine = mine?.status === 'loading';
  const canRefresh = [list, mine].some(part => part?.status !== 'failed' || part.error.retryAt <= leaderboardNow());

  return <GameDialog id="toy-rank-dialog" title={copy.title} dismiss={close}>
    <div className={c('panel') + ' toy-rank-panel'}>
      <header className="toy-rank-header">
        <div><h2>{copy.title}</h2><p>{volumeById(volume).name}</p></div>
        <button type="button" className="toy-rank-control" onClick={close}>{text.t('close')}</button>
      </header>
      <div className="toy-rank-selector" role="group" aria-label={copy.volume}>
        {leaderboardVolumes.map(id => <button type="button" className="toy-rank-control" key={id}
          aria-pressed={id === volume} onClick={() => setVolume(id)}>{volumeById(id).name}</button>)}
      </div>
      <div className="toy-rank-actions">
        <div className="toy-rank-period" role="group" aria-label={copy.period}>
          {periods.map(value => <button type="button" className="toy-rank-control" key={value}
            aria-pressed={value === period} onClick={() => setPeriod(value)}>{copy[value]}</button>)}
        </div>
        <button type="button" className="toy-rank-control" disabled={client.limited || loadingList || loadingMine || !canRefresh}
          onClick={() => client.read(board, period, { refresh: true })}>{copy.refresh}</button>
      </div>
      <dl className="toy-rank-summary">
        <div><dt>{copy.myRank}</dt><dd>{personal?.ranked ? `#${text.number(personal.rank)}` : '—'}</dd></div>
        <div><dt>{copy.myBest}</dt><dd>{text.score(personal?.ranked ? personal.score : null)}</dd></div>
        <div><dt>{copy.boardBest}</dt><dd>{text.score(rows[0]?.score)}</dd></div>
      </dl>
      <div className="toy-rank-list" role="region" aria-label={copy.title} tabIndex={rows.length ? 0 : undefined} aria-busy={!!loadingList}>
        {rows.length > 0 && <table aria-label={copy.title}>
          <thead><tr><th scope="col">{copy.rank}</th><th scope="col">{copy.player}</th><th scope="col">{copy.score}</th></tr></thead>
          <tbody>{rows.map(entry => <tr key={entry.rank}>
            <td>{text.number(entry.rank)}</td>
            <td><span className="toy-rank-name">
              <span className="toy-rank-avatar" aria-hidden="true">
                {Array.from(entry.nickname.trim())[0]?.toLocaleUpperCase() ?? '·'}
                {entry.avatar && <img src={entry.avatar} alt="" loading="lazy" referrerPolicy="no-referrer"
                  onError={event => { event.currentTarget.hidden = true; }} />}
              </span>
              <span dir="auto">{entry.nickname || copy.anonymous}</span>
            </span></td>
            <td>{text.score(entry.score)}</td>
          </tr>)}</tbody>
        </table>}
        <div className="toy-rank-notices" role="status">
          {loadingList && <p>{copy.loading}</p>}
          {list?.status === 'failed' && <p>{copy[list.error.kind]}</p>}
          {list?.status === 'ready' && rows.length === 0 && <p>{copy.empty}</p>}
          {!list && <p>{client.limited ? copy.limited : copy.refreshSession}</p>}
          {mine?.status === 'failed' && (list?.status !== 'failed' || list.error.kind !== mine.error.kind) && <p>{copy[mine.error.kind]}</p>}
          {mine?.status === 'ready' && !mine.value.ranked && <p>{copy.unranked}</p>}
        </div>
      </div>
      <p className="toy-rank-rules">{copy.rules}</p>
    </div>
  </GameDialog>;
}

export function CompetitiveResult({ client, run, snapshot, open }: {
  client: LeaderboardClient; run: RunSettlement; snapshot: GameSnapshot; open(): void;
}) {
  const { text } = usePlayerText();
  const copy = copyFor(text.locale);
  useSyncExternalStore(client.subscribe, client.getSnapshot);
  const candidate = competition(run);
  const state = client.submission(run);
  const sent = state?.status === 'sent';
  useEffect(() => {
    if (candidate.board !== undefined && sent) client.read(candidate.board, 'all', { personal: false });
  }, [client, candidate.board, sent]);
  if (candidate.reason) return <p className="toy-result-note">{copy[candidate.reason === 'score' ? 'invalidScore' : candidate.reason]}</p>;
  const top = sent ? client.board(candidate.board, 'all').list : undefined;
  const disabledHere = state?.status === 'failed' && state.error.kind === 'unsupported';
  const canRetry = state?.status !== 'failed' || Number.isFinite(state.error.retryAt);
  return <div className="toy-result-competition">
    <dl className="toy-rank-summary">
      <div><dt>{copy.current}</dt><dd>{text.score(candidate.score)}</dd></div>
      <div><dt>{copy.local}</dt><dd>{text.score(snapshot.localRecord.best)}</dd></div>
      {sent && <div><dt>{copy.boardBest}</dt><dd>{text.score(top?.status === 'ready' ? top.value[0]?.score : null)}</dd></div>}
    </dl>
    <div role="status" className="toy-rank-notices">
      {state?.status === 'sending' && <p>{copy.sending}</p>}
      {state?.status === 'sent' && <p>{copy.sent}</p>}
      {state?.status === 'failed' && <p>{disabledHere ? copy.submitUnavailable : state.pending ? copy.waiting : copy[state.error.kind]}</p>}
      {client.limited && !(state?.status === 'failed' && state.error.kind === 'limited') && <p>{copy.limited}</p>}
    </div>
    {state?.status === 'sent' || disabledHere ? <button type="button" className="toy-rank-control" onClick={open}>{copy.view}</button> : canRetry &&
      <button type="button" className="toy-rank-control" disabled={!client.canSubmit(state)} onClick={() => client.submit(run)}>
        {state?.status === 'failed' ? copy.retry : copy.submit}
      </button>}
  </div>;
}
