import type { Config } from '@react-router/dev/config';

export default {
  ssr: false,
  prerender: ['/', '/debug/', '/debug/audio/'],
  routeDiscovery: { mode: 'initial' },
} satisfies Config;
