import { fileURLToPath } from 'node:url';
import { build } from 'vite';

await build({
  configFile: false,
  root: fileURLToPath(new URL('audio/', import.meta.url)),
  base: '/tools/',
  build: {
    outDir: fileURLToPath(new URL('../build/client/tools/', import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: {
      input: fileURLToPath(new URL('audio/render-audio.html', import.meta.url)),
    },
  },
});
