import { index, route, type RouteConfig } from '@react-router/dev/routes';
import { explorerTopics } from './components/explorer/explorer-paths';

export default [
  index('routes/home.tsx'),
  route('debug', 'routes/debug.tsx', [
    index('routes/explorer.index.tsx'),
    ...explorerTopics.map(topic => route(topic, topic === 'worlds' || topic === 'lighting'
      ? 'routes/explorer.live.tsx' : 'routes/explorer.topic.tsx', { id: `explorer/${topic}` })),
    route('audio', 'routes/debug.audio.tsx'),
    route('legacy', 'routes/debug.legacy.tsx'),
  ]),
] satisfies RouteConfig;
