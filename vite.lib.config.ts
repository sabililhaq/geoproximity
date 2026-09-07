import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Do not inline demo .env keys into the published bundle.
  envPrefix: 'GEOPROXIMITY_LIB_',
  publicDir: false,
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'geoproximity.js',
    },
    rollupOptions: {
      external: ['leaflet', 'leaflet/dist/leaflet.css'],
      output: {
        assetFileNames: 'geoproximity[extname]',
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
