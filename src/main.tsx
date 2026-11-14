import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/lexend';
import './styles.css';

// The painted Space Q scenes, as CSS variables (from public/, so they resolve against the page).
for (const name of ['day', 'night', 'hangar']) {
  const file = name === 'hangar' ? 'hangar' : `base-${name}`;
  document.documentElement.style.setProperty(`--scene-${name}`, `url("${new URL(`./art/backgrounds/${file}.webp`, document.baseURI).href}")`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline cache for the installed app. Skipped in development so edits show up at once.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
