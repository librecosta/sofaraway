import type { ReactNode } from 'react';
import { usePlayerText } from '../i18n/PlayerLocale';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { GameDialog } from './GameDialog';

export function CreditsPanel({ close, preview, author = 'librecosta', inspiration = 'HelloRun', children }: {
  close(): void; preview?: boolean; author?: ReactNode; inspiration?: ReactNode; children?: ReactNode;
}) {
  const { text: { t } } = usePlayerText();
  return <GameDialog id="panel" title={t('creditsDialog')} dismiss={close} preview={preview}>
    <div className={c('panel', 'credits-panel')}>
      <h2 className={c('panel-head')}>{t('credits')}</h2>
      <div id="panel-body">
        <p><b>SoFarAway</b><br />{t('creditsIntro')}</p>
        <p>{t('madeBy')} {author}<br />
          {t('generated')}</p>
        <p><b>{t('inspiration')}</b><br />{t('inspiredBy')} {inspiration} (HelloEnjoy, 2013)</p>
        {children ?? <p>{t('localLicenses')}</p>}
      </div>
      <DecodeButton className={c('panel-close')} data-act="closepanel" onClick={close} label={t('close')} />
    </div>
  </GameDialog>;
}
