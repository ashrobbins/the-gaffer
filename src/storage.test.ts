import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createGame, GAME_VERSION } from './game';
import { indexedDbStorage, memoryStorage, type GameStorage } from './storage';

const club = { name: 'Test Town', stadiumName: 'Test Park', kit: { style: 'hoops' as const, primary: '#1f5fd8', secondary: '#f2f2f2' } };

function behavesLikeStorage(label: string, make: () => GameStorage): void {
  describe(label, () => {
    it('has nothing saved at first', async () => {
      expect(await make().load()).toBeNull();
    });

    it('saves a game and loads exactly the same game back', async () => {
      const storage = make();
      const game = createGame(club, 11);
      await storage.save(game);
      expect(await storage.load()).toEqual(game);
    });

    it('keeps only the latest save', async () => {
      const storage = make();
      await storage.save(createGame(club, 1));
      const second = createGame({ ...club, name: 'Second FC' }, 2);
      await storage.save(second);
      const loaded = await storage.load();
      expect(loaded!.world.clubs[loaded!.world.userClubId]!.name).toBe('Second FC');
    });

    it('deletes everything when cleared', async () => {
      const storage = make();
      await storage.save(createGame(club, 3));
      await storage.clear();
      expect(await storage.load()).toBeNull();
    });

    it('can be cleared when there is nothing there, and saved to again afterwards', async () => {
      const storage = make();
      await storage.clear();
      await storage.save(createGame(club, 4));
      expect(await storage.load()).not.toBeNull();
    });
  });
}

behavesLikeStorage('memoryStorage', () => memoryStorage());
let n = 0;
behavesLikeStorage('indexedDbStorage', () => indexedDbStorage(`test-db-${n++}`));

describe('saved games from another version', () => {
  it('are ignored rather than loaded', async () => {
    const storage = memoryStorage();
    await storage.save({ ...createGame(club, 5), version: GAME_VERSION + 1 });
    expect(await storage.load()).toBeNull();
  });

  it('are ignored by the browser store too', async () => {
    const storage = indexedDbStorage('test-db-version');
    await storage.save({ ...createGame(club, 5), version: 0 });
    expect(await storage.load()).toBeNull();
  });
});

describe('createGame', () => {
  it('starts on opening day with the user in the bottom division and the cup drawn', () => {
    const game = createGame(club, 6);
    expect(game.date).toBe('2026-08-22');
    expect(game.season.round).toBe(0);
    expect(game.world.clubs[game.world.userClubId]).toMatchObject({ name: 'Test Town', division: 3 });
    expect(game.cup.rounds[0]!.ties).toHaveLength(16);
    expect(game.version).toBe(GAME_VERSION);
  });

  it('is the same game for the same seed', () => {
    expect(createGame(club, 7, new Date(0))).toEqual(createGame(club, 7, new Date(0)));
  });
});
