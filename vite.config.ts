import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = resolve(import.meta.dirname, 'src');

export default defineConfig(({ mode }) => ({
  root,
  publicDir: resolve(import.meta.dirname, 'public'),
  base: '',
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome102',
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    modulePreload: false,
    rolldownOptions: {
      input: {
        background: resolve(root, 'background/index.ts'),
        popup: resolve(root, 'popup/index.html'),
        options: resolve(root, 'options/index.html'),
      },
      output: {
        // The manifest references the service worker by a fixed name.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
  },
}));
