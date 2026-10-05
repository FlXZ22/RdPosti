/*
 * Vercel Web Analytics per un sito statico (senza npm né bundler).
 *
 * Fa le stesse cose di `inject()` di @vercel/analytics:
 * 1. crea subito la coda `window.va`, così gli eventi chiamati prima che lo script
 *    sia caricato non vanno persi;
 * 2. carica lo script con `defer`:
 *    - in produzione su Vercel: /_vercel/insights/script.js (la route la crea Vercel
 *      quando attivi Web Analytics nel progetto);
 *    - in locale (localhost): lo script di debug, che scrive in console e non invia nulla;
 *    - aperto come file (file://): niente, non c'è nessun server a cui inviare.
 *
 * Privacy: gli eventi contengono solo numeri e tipi, mai nomi di studenti.
 */
(function () {
  'use strict';

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  const { protocol, hostname } = window.location;
  const isWeb = protocol === 'http:' || protocol === 'https:';
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(hostname) || hostname.endsWith('.local');

  if (isWeb) {
    const src = isLocal ? 'https://va.vercel-scripts.com/v1/script.debug.js' : '/_vercel/insights/script.js';
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.sdkn = 'rdposti-static';
      script.onerror = () => {
        console.log(isLocal
          ? '[Vercel Web Analytics] Script di debug non caricato (ad blocker?).'
          : '[Vercel Web Analytics] Script non trovato: attiva Web Analytics nel progetto Vercel e rifai il deploy.');
      };
      document.head.appendChild(script);
    }
  }

  /**
   * Evento personalizzato. I valori devono essere string, number, boolean o null
   * (gli oggetti annidati non sono ammessi da Vercel e vengono scartati).
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
