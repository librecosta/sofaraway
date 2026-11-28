import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  plugins: [reactRouter()],
  define: { __LIVE_GATE_QUALITY_DEV__: JSON.stringify(command === 'serve' && !isPreview) },
  build: { license: { fileName: 'THIRD-PARTY-NOTICES.txt' } },
}));
