import './ui/style.css';
import { createGame } from './game.js';

try {
  createGame(document.getElementById('world'));
} catch (error) {
  console.error(error);
  document.getElementById('error').hidden = false;
}
