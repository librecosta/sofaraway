import { usePlayerText } from '../i18n/PlayerLocale';
import { classes as c } from '../styles/classes';
import publicSecurityBadge from './china-public-security.png?inline';

export function ChinaRegistration() {
  const { text } = usePlayerText();
  return <footer className={c('menu-compliance')} data-registration="cn"
    aria-label={text.locale === 'zh-CN' ? '中国大陆备案' : 'China registration'}>
    <a href="https://beian.miit.gov.cn/" lang="zh-CN" target="_blank" rel="noreferrer">蜀ICP备2025158691号-3</a>
    <a href="https://beian.mps.gov.cn/#/query/webSearch?code=51010702045043" lang="zh-CN" target="_blank" rel="noreferrer">
      <img src={publicSecurityBadge} width={13} height={14} alt="" />川公网安备51010702045043号
    </a>
  </footer>;
}
