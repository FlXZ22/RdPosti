/*
 * Vercel Web Analytics + Speed Insights per un sito statico (senza npm né bundler).
 *
 * Fa le stesse cose di `inject()` (@vercel/analytics) e `injectSpeedInsights()`
 * (@vercel/speed-insights):
 * 1. crea subito le code `window.va` / `window.si`, così le chiamate fatte prima che
 *    gli script siano caricati non vanno perse;
 * 2. carica gli script con `defer`:
 *    - in produzione su Vercel: /_vercel/insights/script.js e /_vercel/speed-insights/script.js
 *      (le route le crea Vercel quando attivi i due prodotti nel progetto);
 *    - in locale (localhost): gli script di debug, che scrivono in console e non inviano nulla;
 *    - aperto come file (file://): niente, non c'è nessun server a cui inviare.
 *
 * Privacy: gli eventi contengono solo numeri e tipi, mai nomi di studenti.
 */
(function () {
  'use strict';

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  window.si = window.si || function () {
    (window.siq = window.siq || []).push(arguments);
  };

  const { protocol, hostname } = window.location;
  const isWeb = protocol === 'http:' || protocol === 'https:';
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(hostname) || hostname.endsWith('.local');

  function loadScript(src, label, dataset) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    Object.assign(script.dataset, { sdkn: 'rdposti-static' }, dataset);
    script.onerror = () => {
      console.log(isLocal
        ? `[Vercel ${label}] Script di debug non caricato (ad blocker?).`
        : `[Vercel ${label}] Script non trovato: attiva ${label} nel progetto Vercel e rifai il deploy.`);
    };
    document.head.appendChild(script);
  }

  if (isWeb) {
    const debug = 'https://va.vercel-scripts.com/v1/';
    loadScript(isLocal ? debug + 'script.debug.js' : '/_vercel/insights/script.js', 'Web Analytics');
    // App di una sola pagina: tutte le misure vanno sotto la route "/"
    loadScript(isLocal ? debug + 'speed-insights/script.debug.js' : '/_vercel/speed-insights/script.js',
      'Speed Insights', { route: '/' });
  }

  /**
   * Evento personalizzato di Web Analytics. I valori devono essere string, number,
   * boolean o null (gli oggetti annidati non sono ammessi da Vercel e vengono scartati).
   * Nota: gli eventi personalizzati compaiono nella dashboard solo nei piani Pro/Enterprise.
   */
  function track(name, data) {
    let clean;
    if (data) {
      clean = {};
      for (const [k, v] of Object.entries(data)) {
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) clean[k] = v;
      }
    }
    try {
      window.va('event', clean ? { name, data: clean } : { name });
    } catch (e) { /* l'analytics non deve mai rompere l'app */ }
  }

  window.RdPosti = window.RdPosti || {};
  window.RdPosti.track = track;
})();
