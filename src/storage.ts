import { GAME_VERSION, type Game } from './game';

/** Where the game is saved. Saves live on the player's own device only. */
export interface GameStorage {
  /** The saved game, or null if there is none or it is from an incompatible version. */
  load(): Promise<Game | null>;
  save(game: Game): Promise<void>;
  /** Deletes everything saved. */
  clear(): Promise<void>;
}

const usable = (g: unknown): g is Game =>
  typeof g === 'object' && g !== null && (g as Game).version === GAME_VERSION && !!(g as Game).world && !!(g as Game).season;

/** Keeps the save in memory only. Used in tests, and as a fallback if the browser will not let us store anything. */
export function memoryStorage(): GameStorage {
  let saved: string | null = null;
  return {
    load: async () => {
      if (saved === null) return null;
      const g: unknown = JSON.parse(saved);
      return usable(g) ? g : null;
    },
    save: async (game) => {
      saved = JSON.stringify(game);
    },
    clear: async () => {
      saved = null;
    },
  };
}

const STORE = 'saves';
const KEY = 'current';

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the save database'));
  });
}

function request<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('Could not use the save database'));
    tx.onabort = () => reject(tx.error ?? new Error('The save was cancelled'));
  });
}

/** Saves in the browser's IndexedDB, in a database of its own. A connection is opened for each action and closed again. */
export function indexedDbStorage(name = 'the-gaffer'): GameStorage {
  return {
    load: async () => {
      const db = await open(name);
      try {
        const value = await request(db, 'readonly', (s) => s.get(KEY));
        return usable(value) ? value : null;
      } finally {
        db.close();
      }
    },
    save: async (game) => {
      const db = await open(name);
      try {
        await request(db, 'readwrite', (s) => s.put(game, KEY));
      } finally {
        db.close();
      }
    },
    clear: () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('Could not delete the save'));
        req.onblocked = () => resolve();
      }),
  };
}
