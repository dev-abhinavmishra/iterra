import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Dev: every place reachable under the shell's origin, mirroring production
// paths — run each app with `npm run dev` inside apps/<name> on its port.
const APP_PORTS: Record<string, number> = {
  rhythm: 3001,
  proof: 3002,
  syllabus: 3003,
  gradestack: 3004,
  timer: 3005,
  ink: 3006,
  flashcards: 3007,
  margin: 3008,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: path.resolve(__dirname, '../packages/hub'),
  server: {
    proxy: Object.fromEntries(
      Object.entries(APP_PORTS).map(([name, port]) => [
        `/apps/${name}`,
        {
          target: `http://localhost:${port}`,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(new RegExp(`^/apps/${name}`), '') || '/',
        },
      ]),
    ),
  },
});
