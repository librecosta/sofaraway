import type { Config } from '@react-router/dev/config';

export default {
  ssr: false,
  prerender: ['/'],
  routeDiscovery: { mode: 'initial' },
} satisfies Config;
