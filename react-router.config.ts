import type { Config } from '@react-router/dev/config';

export default {
  ssr: false,
  prerender: ['/', '/debug/'],
  routeDiscovery: { mode: 'initial' },
} satisfies Config;
