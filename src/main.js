// ============================================================================
// main.js
// ----------------------------------------------------------------------------
// The very first file that runs. Its only job is to start up Vue and tell
// it to render App.vue into the <div id="app"> that lives in index.html.
// ============================================================================

import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { initAnalytics } from './services/analytics.js';
import { establishBadgeBaseline } from './logic/badgeUnlocks.js';

initAnalytics();
// Must follow initAnalytics(): the baseline fires a badge_unlocked per
// back-awarded badge, and track() silently no-ops until PostHog is up. Runs
// on every boot but only ever acts once -- see establishBadgeBaseline().
establishBadgeBaseline();
createApp(App).mount('#app');
