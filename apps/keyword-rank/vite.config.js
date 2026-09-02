import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
