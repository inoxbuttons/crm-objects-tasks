import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// BASE_PATH задаётся при сборке для GitHub Pages (сайт живёт в /<repo>/).
// Локально и на Vercel — корень.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
