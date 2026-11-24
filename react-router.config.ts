import type { Config } from '@react-router/dev/config';
import { explorerPath, explorerTopics } from './app/components/explorer/explorer-paths';

export default {
  ssr: false,
  prerender: ['/', explorerPath('overview'), ...explorerTopics.map(explorerPath), explorerPath('audio'), explorerPath('legacy')],
  routeDiscovery: { mode: 'initial' },
} satisfies Config;
