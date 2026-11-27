import { defaultLocaleFor } from './player-text';

export const webDefaultLocale = defaultLocaleFor(import.meta.env.VITE_REGION === 'cn' ? 'cn' : 'intl', 'web');
