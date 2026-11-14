import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('debug', 'routes/debug.tsx'),
  route('debug/audio', 'routes/debug.audio.tsx'),
] satisfies RouteConfig;
