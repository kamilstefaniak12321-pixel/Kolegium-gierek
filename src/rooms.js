import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { catalog } from '../public/catalog.js';
import { requireThat } from './errors.js';
import { games } from './games/index.js';

const codeSymbols = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
const offlineAfter = 65_000;
const releaseSeatAfter = 5 * 60_000;
const expireRoomAfter = 2 * 60 * 60_000;

function makePlayer(rawName, now) {
  requireThat(typeof rawName === 'string', 'Podaj swój pseudonim.');
  const name = rawName.normalize('NFC').trim().replace(/\s+/gu, ' ');
  requireThat(/^[\p{L}\p{N}][\p{L}\p{M}\p{N} _.-]{0,17}$/u.test(name),
    'Pseudonim może mieć 1–18 znaków. Zacznij od litery lub cyfry.');
  return { id: randomUUID(), token: randomBytes(24).toString('base64url'), name, lastSeen: now, online: true };
}

export class Rooms {
  constructor(clock = Date.now) {
    this.clock = clock;
    this.rooms = new Map();
  }

  get(code) {
    const room = this.rooms.get(code);
    requireThat(room, 'Nie ma takiego pokoju. Sprawdź kod lub utwórz nowy pokój.', 404);
    return room;
  }

  create(gameId, name) {
    const engine = games.get(gameId);
    requireThat(engine, 'Wybierz grę z katalogu.');
    requireThat(this.rooms.size < 2000, 'Wszystkie stoliki są zajęte. Spróbuj za chwilę.', 503);
    const now = this.clock();
    const player = makePlayer(name, now);
    let code;
    do {
      code = Array.from({ length: 6 }, () => codeSymbols[randomInt(codeSymbols.length)]).join('');
    } while (this.rooms.has(code));
    const room = { code, gameId, engine, game: engine.fresh(), hostId: player.id, players: [player],
      revision: 1, listeners: new Set(), lastVisit: now, notice: '' };
    this.rooms.set(code, room);
    return { code, token: player.token, state: this.view(room, player) };
  }

  join(code, name) {
    const room = this.get(code);
    this.tickRoom(room, this.clock());
    requireThat(room.game.phase === 'lobby', 'Ten pokój już gra. Dołącz w poczekalni przed kolejnym meczem.', 409);
    requireThat(room.players.length < catalog[room.gameId].maxPlayers, 'Wszystkie miejsca w pokoju są zajęte.', 409);
    const player = makePlayer(name, this.clock());
    requireThat(!room.players.some(p => p.name.toLocaleLowerCase('pl') === player.name.toLocaleLowerCase('pl')),
      'Ten pseudonim jest zajęty w tym pokoju.', 409);
    room.players.push(player);
    room.lastVisit = player.lastSeen;
    room.notice = '';
    this.chooseHost(room);
    this.changed(room);
    return { code, token: player.token, state: this.view(room, player) };
  }

  auth(code, token, now = this.clock()) {
    const room = this.get(code);
    this.tickRoom(room, now);
    const player = room.players.find(p => p.token === token);
    requireThat(player, 'Twoje miejsce w tym pokoju wygasło. Dołącz ponownie.', 401);
    room.lastVisit = player.lastSeen = now;
    if (!player.online) {
      player.online = true;
      this.chooseHost(room);
      this.changed(room);
    }
    return { room, player };
  }

  action(code, token, action, data) {
    const now = this.clock();
    const { room, player } = this.auth(code, token, now);
    if (action === 'leave') {
      this.remove(room, player.id, now);
      this.changed(room);
      if (!room.players.length) this.rooms.delete(code);
      return { left: true };
    }
    room.engine.act(room, player, action, data, now);
    room.notice = '';
    this.changed(room);
    return this.view(room, player);
  }

  remove(room, id, now) {
    room.players = room.players.filter(p => p.id !== id);
    this.chooseHost(room);
    room.engine.playerLeft(room, id, now);
  }

  chooseHost(room) {
    if (room.players.some(p => p.id === room.hostId && p.online)) return;
    room.hostId = (room.players.find(p => p.online) || room.players[0])?.id || null;
  }

  tickRoom(room, now) {
    let changed = false;
    for (const p of [...room.players]) {
      const idle = now - p.lastSeen;
      if (idle >= releaseSeatAfter && room.players.some(other => other.online && now - other.lastSeen < offlineAfter)) {
        this.remove(room, p.id, now);
        changed = true;
      } else if (p.online && idle >= offlineAfter) {
        p.online = false;
        changed = true;
      }
    }
    this.chooseHost(room);
    if (room.engine.advance(room, now) || changed) this.changed(room);
  }

  tick() {
    const now = this.clock();
    for (const room of this.rooms.values()) {
      if (now - room.lastVisit >= expireRoomAfter) {
        this.rooms.delete(room.code);
        this.changed(room);
      } else this.tickRoom(room, now);
    }
  }

  changed(room) {
    room.revision += 1;
    for (const notify of [...room.listeners]) notify();
  }

  view(room, player) {
    return { code: room.code, gameId: room.gameId, revision: room.revision, now: this.clock(),
      me: player.id, hostId: room.hostId, notice: room.notice,
      players: room.players.map(({ id, name, online }) => ({ id, name, online })),
      game: room.engine.view(room, player.id) };
  }
}
