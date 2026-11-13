import './ui/style.css';
// Imported first, so the world worked out ahead of time is being fetched while the rest loads.
import './world/compiled.js';
import { createGame } from './game.js';

try {
  createGame(document.getElementById('world'));
} catch (error) {
  console.error(error);
  document.getElementById('error').hidden = false;
}
