import './ui/styles.css';
import { indexedDbStorage } from './storage';
import { App } from './ui/app';

const root = document.querySelector<HTMLElement>('#app');
if (root) void new App(root, { storage: indexedDbStorage() }).start();
