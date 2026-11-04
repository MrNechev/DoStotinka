import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadTranslations } from './i18n';
import './styles.css';

// The app module (and everything that translates texts when it is imported) loads only after the
// dictionary of the user's language is ready.
await loadTranslations();
const { App } = await import('./App');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker in production builds (installable app, fast start-up).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* not critical */
    });
  });
}
