/*
 * Vercel Web Analytics using the official @vercel/analytics package.
 *
 * This script imports and initializes Vercel Web Analytics using the inject() function
 * from the official package, which:
 * 1. Creates the window.va queue for tracking events
 * 2. Loads the appropriate analytics script:
 *    - In production on Vercel: /_vercel/insights/script.js
 *    - In development (localhost): debug script that logs to console
 *
 * Privacy: events contain only numbers and types, never student names.
 */

import { inject, track } from '../node_modules/@vercel/analytics/dist/index.mjs';

// Initialize Vercel Web Analytics
inject({
  mode: 'auto', // automatically detects development vs production
  debug: true   // enables debug logging in development
});

// Export track function for custom events
window.RdPosti = window.RdPosti || {};
window.RdPosti.track = track;
