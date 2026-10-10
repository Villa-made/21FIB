/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // En build, los fixtures (datos y aprobaciones simuladas) se sustituyen por un stub.
      ...(command === 'build' ? [{ find: /^@\/lib\/fixtures$/, replacement: src('lib/fixtures.prod-stub.ts') }] : []),
      { find: /^@\//, replacement: src('') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
