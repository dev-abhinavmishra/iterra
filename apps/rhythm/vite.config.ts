/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/apps/rhythm/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    /* Contract tests import the whole store graph inside the test body, so
       the first test in a worker pays the cold transform — 5s is too tight
       on a loaded machine. */
    testTimeout: 15_000,
  },
}));
