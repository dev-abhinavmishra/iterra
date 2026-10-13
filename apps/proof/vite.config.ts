/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/apps/proof/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    /* the adapter contract tests await-import the whole module chain
       (zustand + katex) under vi.resetModules() — a cold transform on a
       loaded box legitimately clears the 5s default, so the first test
       flaked without ever asserting */
    testTimeout: 20000,
  },
}));
