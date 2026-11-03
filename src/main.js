import './ui/style.css';
// Imported first, so the worker that builds the height field starts before anything else loads.
import './world/prebuild.js';
import { createGame } from './game.js';

createGame(document.getElementById('world')).catch(error => {
  console.error(error);
  document.getElementById('error').hidden = false;
});
