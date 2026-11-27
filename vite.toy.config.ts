import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const excludedModules = /\/(?:app\/(?:web\/|routes\/|components\/(?:explorer\/|ChinaRegistration\.|NavigationButton\.)|game\/debug\/)|toy\/dev\/|node_modules\/(?:react-router|react-refresh)\/|tests\/)/i;
const notices = {
  'LICENSE.txt': './LICENSE',
  'OFL-Chakra-Petch.txt': './css/fonts/OFL-Chakra-Petch.txt',
  'OFL-Rajdhani.txt': './css/fonts/OFL-Rajdhani.txt',
};

function playerRelease(): Plugin {
  return {
    name: 'sofaraway-toy-release',
    apply: 'build',
    generateBundle(_, bundle) {
      const modules = new Set<string>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const [id, module] of Object.entries(chunk.modules)) {
          if (!module.renderedLength) continue;
          const path = id.replaceAll('\\', '/');
          if (excludedModules.test(path)) this.error(`Forbidden module in Toy Release: ${path}`);
          modules.add(path);
        }
        for (const target of [...chunk.imports, ...chunk.dynamicImports]) {
          if (!bundle[target]) this.error(`External import in Toy Release: ${target}`);
        }
      }
      for (const [fileName, source] of Object.entries(notices)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(source, import.meta.url)) });
      }
      this.info(`Checked ${modules.size} rendered modules for Web, debug and Toy Development imports.`);
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  root: fileURLToPath(new URL('./toy/', import.meta.url)),
  base: './',
  publicDir: false,
  plugins: [react(), playerRelease()],
  define: {
    __PLAYER_ONLY_TOY__: 'true',
    __TOY_DEVELOPMENT__: JSON.stringify(command === 'serve' && !isPreview),
  },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('./build/toy/', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    license: { fileName: 'THIRD-PARTY-NOTICES.txt' },
  },
}));
