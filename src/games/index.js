import { sentenceGame } from './literowe-zdania.js';

export const games = new Map([sentenceGame].map(game => [game.id, game]));
