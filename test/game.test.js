import test from 'node:test';
import assert from 'node:assert/strict';
import { Rooms } from '../src/rooms.js';
import { checkSentence, starterSentences } from '../src/games/literowe-zdania.js';

const id = 'literowe-zdania';
function table(names = ['Ala', 'Jan', 'Ewa']) {
  let now = 1000;
  const rooms = new Rooms(() => now);
  const host = rooms.create(id, names[0]);
  const players = [host, ...names.slice(1).map(name => rooms.join(host.code, name))];
  const room = rooms.get(host.code);
  function act(index, action, data = {}) {
    return rooms.action(host.code, players[index].token, action, { roundId: room.game.roundId, ...data });
  }
  function start() {
    act(0,'start');
    room.game.letters = [...'AKLMOT'];
  }
  function closeWriting() { players.forEach((p,i) => act(i,'finish')); }
  return { rooms, room, players, act, start, closeWriting, elapse: ms => { now += ms; } };
}

test('kody, pseudonimy, miejsca i decyzje gospodarza', () => {
  const { rooms, room, act } = table(['Ola']);
  assert.match(room.code, /^[A-Z2-9]{6}$/u);
  assert.throws(() => rooms.join(room.code,'ola'), /zajęty/);
  assert.throws(() => rooms.join(room.code,'<>'), /Pseudonim/);
  assert.throws(() => act(0,'start'), /dwie osoby/);
  const second = rooms.join(room.code,'Maja');
  assert.throws(() => rooms.action(room.code,second.token,'settings',{ roundId: null, seconds: 60, rounds: 1 }), /gospodarz/);
  assert.throws(() => rooms.auth(room.code,'publiczne-id'), /miejsce/);
  assert.throws(() => act(0,'settings',{ seconds: -1, rounds: 1 }), /ustawienia/);
  for (let n = 0; n < 6; n++) rooms.join(room.code,'G' + n);
  assert.throws(() => rooms.join(room.code,'Jeszcze ktoś'), /miejsca/);
});

test('słownik, interpunkcja, polskie znaki i granice zdania', () => {
  const letters = [...'AKLMOT'];
  assert.equal(checkSentence('  ALA,   ma kota! ', letters).key,'ala ma kota');
  assert.deepEqual(checkSentence('Ala ma kota.', letters).unknown,[]);
  assert.deepEqual(checkSentence('Kot moka.', letters).unknown,['moka']);
  assert.throws(() => checkSentence('Kot ma łom.', letters), /Ł/);
  assert.throws(() => checkSentence('Kot 123 ma.', letters), /zdanie/);
  assert.throws(() => checkSentence('Kot ma. Kot ma.', letters), /zdanie/);
  assert.throws(() => checkSentence('Kot', letters), /dwóch słów/);
  assert.throws(() => checkSentence('Kot ' + 'a'.repeat(160), letters), /160/);
  assert.deepEqual(checkSentence('Kot je so\u0301l.', [...'KOTJESÓL']).unknown,[]);
});

test('losowanie daje dwanaście różnych polskich liter i przynajmniej trzy samogłoski', () => {
  for (const text of starterSentences) {
    const tiles = [...new Set(text.toUpperCase().replaceAll(' ',''))];
    const vowels = tiles.filter(l => 'AĄEĘIOÓUY'.includes(l)).length;
    assert.ok(tiles.length + Math.max(0, 3 - vowels) <= 12, text);
    assert.deepEqual(checkSentence(text, tiles).unknown, [], text);
  }
  const seen = new Set();
  for (let n = 0; n < 60; n++) {
    const { room, act } = table(['Ola','Ala']);
    act(0,'start');
    const letters = room.game.letters;
    assert.equal(new Set(letters).size,12);
    assert.ok(letters.filter(l => 'AĄEĘIOÓUY'.includes(l)).length >= 3);
    seen.add(letters.join(''));
  }
  assert.ok(seen.size > 1);
});

test('prywatne pisanie, duplikaty, głosowanie, wynik, remis i rewanż', () => {
  const { room, rooms, players, act, start, closeWriting } = table();
  act(0,'settings',{ seconds: 60, rounds: 1 });
  start();
  assert.throws(() => rooms.join(room.code,'Gość'), /już gra/);
  act(0,'submit',{ text:'Ala ma kota.' });
  assert.throws(() => act(0,'submit',{ text:'ALA, ma kota!' }), /już to zdanie/);
  act(1,'submit',{ text:'Ala ma kota!' });
  act(1,'submit',{ text:'Kot moka.' });
  act(2,'submit',{ text:'Ma makat.' });
  const mine = rooms.view(room,room.players[0]).game.entries;
  assert.equal(mine.length,1);
  closeWriting();
  const view = rooms.view(room,room.players[0]).game;
  assert.equal(view.phase,'voting');
  assert.ok(view.entries.every(e => e.author === undefined));
  const disputed = view.entries.find(e => e.text === 'Kot moka.').id;
  const second = view.entries.find(e => e.text === 'Ma makat.').id;
  assert.throws(() => act(1,'vote',{ entryId:disputed, yes:true }), /Twoje zdanie/);
  act(0,'vote',{ entryId:disputed, yes:true });
  assert.throws(() => act(0,'vote',{ entryId:disputed, yes:true }), /już zapisany/);
  act(2,'vote',{ entryId:disputed, yes:false });
  act(0,'vote',{ entryId:second, yes:true });
  act(1,'vote',{ entryId:second, yes:true });
  for (let i = 0; i < 3; i++) act(i,'reviewed');
  assert.equal(room.game.phase,'results');
  assert.deepEqual(players.map(p => room.game.totals[p.state.me]),[1,1,1]);
  assert.equal(room.game.entries.find(e => e.id === disputed).status,'rejected');
  rooms.tick();
  assert.deepEqual(players.map(p => room.game.totals[p.state.me]),[1,1,1]);
  const next = act(0,'rematch');
  assert.equal(next.game.phase,'lobby');
  assert.equal(next.code,room.code);
  assert.deepEqual(next.game.totals,{});
  assert.equal(next.game.settings.rounds,1);
});

test('sens zdania ze znanych słów może rozstrzygnąć grupa', () => {
  const { room, act, start, closeWriting } = table();
  start();
  act(0,'submit',{ text: 'Kot kot kot.' });
  closeWriting();
  const entryId = room.game.entries[0].id;
  assert.throws(() => act(0,'challenge',{ entryId }), /Twoje zdanie/);
  act(1,'challenge',{ entryId });
  assert.throws(() => act(1,'vote',{ entryId, yes:false }), /już zapisany/);
  act(2,'vote',{ entryId, yes:false });
  assert.equal(room.game.phase,'results');
  assert.equal(room.game.entries[0].status,'rejected');
});

test('serwer zamyka wpisy i głosy na czas, nawet bez aktywnego klienta', () => {
  const { rooms, room, act, start, elapse } = table();
  start();
  const roundId = room.game.roundId;
  act(0,'submit',{ text:'Kot moka' });
  act(0,'submit',{ text:'Ala ma kota' });
  elapse(90_000);
  assert.throws(() => act(1,'submit',{ text:'Ala ma kota' }), /zamknięte/);
  assert.equal(room.game.phase,'voting');
  elapse(60_000);
  rooms.tick();
  assert.equal(room.game.phase,'results');
  assert.deepEqual(room.game.entries.map(e => e.status),['rejected','accepted']);
  rooms.auth(room.code,room.players[0].token);
  act(1,'next');
  assert.notEqual(room.game.roundId,roundId);
  assert.throws(() => act(1,'submit',{ roundId,text:'Kot ma' }), /zmieniła/);
  assert.equal(room.game.number,2);
  assert.equal(room.game.entries.length,0);
});

test('powrót w tej samej sesji, przekazanie gospodarza i odzyskanie pokoju po wyjściu', () => {
  const { rooms, room, players, act, start, elapse } = table(['Ala','Maja']);
  start();
  elapse(40_000);
  rooms.auth(room.code,players[1].token);
  elapse(26_000);
  rooms.tick();
  assert.equal(room.hostId,players[1].state.me);
  assert.equal(room.players[0].online,false);
  const back = rooms.auth(room.code,players[0].token);
  assert.equal(back.player.online,true);
  assert.equal(back.player.id,players[0].state.me);
  assert.equal(room.hostId,players[1].state.me);
  act(1,'leave');
  assert.equal(room.hostId,players[0].state.me);
  assert.equal(room.game.phase,'lobby');
  assert.throws(() => rooms.auth(room.code,players[1].token), /wygasło/);
  const returned = rooms.join(room.code,'Maja');
  assert.notEqual(returned.token,players[1].token);
  rooms.action(room.code,returned.token,'leave',{});
  act(0,'leave');
  assert.throws(() => rooms.get(room.code), /Nie ma takiego pokoju/);
});

test('nieaktywny stolik zwalnia kod, a stara sesja nie działa w innym pokoju', () => {
  const { rooms,room,players,elapse } = table();
  const second = rooms.create(id,'Ala');
  assert.throws(() => rooms.auth(second.code,players[0].token), /wygasło/);
  elapse(2 * 60 * 60_000);
  rooms.tick();
  assert.throws(() => rooms.get(room.code), /Nie ma takiego pokoju/);
});
