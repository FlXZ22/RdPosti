'use client';

import { useEffect } from 'react';
import { track } from '@vercel/analytics';

// Logica dell'app (Union-Find, algoritmo, interfaccia): file JS in public/js
const SCRIPTS = ['/js/unionfind.js', '/js/solver.js', '/js/app.js'];

let started = false; // in sviluppo React esegue gli effetti due volte: carichiamo una volta sola

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Impossibile caricare ${src}`));
    document.body.appendChild(s);
  });
}

/**
 * Avvia l'app dopo che React ha idratato la pagina (così gli script possono
 * modificare il DOM senza errori di idratazione) e le passa `track` di
 * @vercel/analytics per gli eventi personalizzati.
 */
export default function ClassroomScripts() {
  useEffect(() => {
    if (started) return;
    started = true;
    window.RdPosti = { ...(window.RdPosti || {}), track };
    (async () => {
      for (const src of SCRIPTS) await loadScript(src);
    })().catch((err) => console.error(err));
  }, []);
  return null;
}
