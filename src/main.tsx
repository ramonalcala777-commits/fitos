import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './globals.css';
import App from './App';
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);

// Modo sin cobertura: registrar el trabajador en segundo plano y, cuando haya datos nuevos,
// guardarlos todos en el dispositivo (catálogos, excepcionales e insumos con sus fichas).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      const base = new URL(import.meta.env.BASE_URL, location.href).href;
      const ready = (await navigator.serviceWorker.ready).active;
      const program = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel=stylesheet],link[rel=modulepreload]')].map(e => (e as HTMLScriptElement).src || (e as HTMLLinkElement).href).filter(Boolean);
      ready?.postMessage({type: 'guardar-programa', urls: [base, ...program]});
      const status = await fetch(base + 'data/ultima-actualizacion.json', {cache: 'no-cache'}).then(r => r.json()).catch(() => null);
      const version = status?.finishedAt || '';
      let saved = ''; try { saved = localStorage.getItem('fitos-datos-guardados') || ''; } catch {}
      if (!version || version === saved) return;
      const files = ['pistacho.json', 'almendro.json', 'cascara.json', 'estado-pistacho.json', 'estado-almendro.json', 'estado-cascara.json', 'normativa-eco.json', 'excepcionales.json', 'excepcionales-revisiones.json', 'cambios-historial.json', 'ultima-actualizacion.json', 'generado/insumos-lista.json', ...Array.from({length: 32}, (_, i) => 'generado/insumos-fichas-' + String(i).padStart(2, '0') + '.json')];
      (registration.active || ready)?.postMessage({type: 'guardar-datos', urls: files.map(f => base + 'data/' + f)});
      try { localStorage.setItem('fitos-datos-guardados', version); } catch {}
    } catch {}
  });
}
