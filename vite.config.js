import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { puzzleAdminServerPlugin } from './vite-plugins/puzzleAdminServer.js'

// https://vite.dev/config/
export default defineConfig({
  // puzzleAdminServerPlugin only adds a configureServer hook, so it's a
  // no-op for `vite build`/`vite preview` -- dev-only, never ships to
  // players. See vite-plugins/puzzleAdminServer.js for why it exists.
  plugins: [vue(), puzzleAdminServerPlugin()],
  test: {
    // jsdom -- not Node's default environment -- because logic/storage.js
    // reads/writes window.localStorage, and services/analytics.js's
    // posthog-js import touches window.addEventListener at import time.
    environment: 'jsdom',
  },
})
