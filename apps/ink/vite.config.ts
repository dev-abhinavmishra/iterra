import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // served under /apps/ink/ inside the iterra terrain
  base: command === 'build' ? '/apps/ink/' : '/',
  plugins: [react()],
}))
