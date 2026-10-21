import '@fontsource/press-start-2p/latin-400.css';
import './ui/styles.css';
import { indexedDbStorage } from './storage';
import { App } from './ui/app';

const root = document.querySelector<HTMLElement>('#app');
if (root) void new App(root, { storage: indexedDbStorage() }).start();

// Work offline once the game has loaded, and ask the browser not to clear the saved game when it is short of space.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
void navigator.storage?.persist?.().catch(() => {});
