import { CreditsPanel } from '../components/CreditsPanel';
import { NavigationButton } from '../components/NavigationButton';
import type { VolumeId } from '../game/contracts';
import { classes as c } from '../styles/classes';

export function WebCreditsPanel({ volume, close, preview }: { volume: VolumeId; close(): void; preview?: boolean }) {
  const props = { className: c('credit-link'), newTab: true, preview };
  return <CreditsPanel close={close} preview={preview}
    author={<NavigationButton {...props} to="https://librecosta.com">librecosta</NavigationButton>}
    inspiration={<NavigationButton {...props} to="https://helloenjoy.itch.io/hellorun">HelloRun</NavigationButton>}>
    <p><NavigationButton to={`/debug/?vol=${volume}`} preview={preview}>Technical Explorer</NavigationButton></p>
    <hr className={c('credits-divider')} />
    <NavigationButton className={c('credit-link', 'credits-contact')} to="mailto:contact@librecosta.com" preview={preview}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" strokeLinejoin="round" />
      </svg>
      contact@librecosta.com
    </NavigationButton>
  </CreditsPanel>;
}
