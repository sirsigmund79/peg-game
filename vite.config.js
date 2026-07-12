import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  test: {
    // jsdom -- not Node's default environment -- because logic/storage.js
    // reads/writes window.localStorage, and services/analytics.js's
    // posthog-js import touches window.addEventListener at import time.
    environment: 'jsdom',
  },
})
