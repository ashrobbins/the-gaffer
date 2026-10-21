import { generateWorld } from './engine/worldgen';

const world = generateWorld(1);
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.textContent = `The Gaffer engine is building. World seed ${world.seed}: ${Object.keys(world.clubs).length} clubs, ${Object.keys(world.players).length} players.`;
}
