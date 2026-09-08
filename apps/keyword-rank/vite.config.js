import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const cloudAssetMap = process.env.KEYWORD_CLOUD_ASSETS
  ? JSON.parse(fs.readFileSync(process.env.KEYWORD_CLOUD_ASSETS, 'utf8').replace(/^\uFEFF/, '')) : null;
const cloudAssets = {
  name: 'keyword-miaoda-assets', enforce: 'pre',
  load(id) {
    if (!cloudAssetMap) return null;
    const relative = path.relative(process.cwd(), id.split('?')[0]).replaceAll('\\', '/');
    if (cloudAssetMap[relative]) return `const path = ${JSON.stringify(cloudAssetMap[relative])}; export default window.parent.__keywordCloudAssets?.[path] || path;`;
    return null;
  },
};

export default defineConfig({
  plugins: [cloudAssets, react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        // Electron loads the bundled IIFE from a file:// URL. Rollup's
        // generated asset helper falls back to document.baseURI when
        // document.currentScript is unavailable for module scripts, so keep
        // the entry bundle and imported images side by side at dist root.
        entryFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
  },
});
