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

initAnalytics();
createApp(App).mount('#app');
