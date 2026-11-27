import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
  build: { license: { fileName: 'THIRD-PARTY-NOTICES.txt' } },
});
