import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { requireThat } from '../errors.js';

const dictionary = new Set(readFileSync(new URL('./slowa-pl.txt', import.meta.url), 'utf8').trim().split(/\s+/u));
export const starterSentences = [
  'Ala ma kota', 'Kot pije mleko', 'Tata lubi lody', 'Mama czyta list',
  'Ola ma psa', 'Kura goni lisa', 'Pies pije wodę', 'Kot tuli psa',
  'Sowa lata nocą', 'Lis lubi las', 'Iga robi sok', 'Jan maluje dom',
  'Ryba łapie raka', 'Maja ma rower', 'Tomek niesie list', 'Ada zbiera maki',
  'Olek kupuje ser', 'Ela pisze list', 'Ryba lubi wodę', 'Osa pije sok',
  'Ania kocha koty', 'Kot łapie myszy', 'Tata gra w karty', 'Mama kupi lody',
];
const alphabet = 'aąbcćdeęfghijklłmnńoóprsśtuwyzźż';
const vowels = 'aąeęioóuy';
const weights = 'aaaaaaaaiiiiiiiooooooeeeeeezzzzznnnnnrrrrrwwwwwssssttttccccyyyykkkkddddpppmmmmuuullljjjłłbbggffhhąęćńóśźż';
const durations = [60, 90, 120];
const rounds = [1, 3, 5];
const voteTime = 60_000;

function drawLetters(previous) {
  let letters;
  do {
    const seed = starterSentences[randomInt(starterSentences.length)].toLocaleLowerCase('pl').replaceAll(' ', '');
    const pool = new Set(seed);
    while ([...pool].filter(letter => vowels.includes(letter)).length < 3) {
      pool.add(vowels[randomInt(vowels.length)]);
    }
    while (pool.size < 12) pool.add(weights[randomInt(weights.length)]);
    letters = [...alphabet].filter(letter => pool.has(letter)).map(letter => letter.toLocaleUpperCase('pl'));
  } while (letters.join('') === previous.join(''));
  return letters;
}

export function checkSentence(input, letters) {
  requireThat(typeof input === 'string', 'Wpisz zdanie.');
  const text = input.normalize('NFC').trim().replace(/\s+/gu, ' ');
  requireThat(text.length <= 160, 'Zdanie może mieć do 160 znaków.');
  const body = text.toLocaleLowerCase('pl').replace(/[.!?…]+$/u, '').trimEnd();
  requireThat(/^[a-ząćęłńóśźż]+(?:[ ,;:–—-]+[a-ząćęłńóśźż]+)+$/u.test(body),
    'Wpisz jedno zdanie z co najmniej dwóch słów. Kropkę możesz dodać na końcu.');
  const words = body.match(/[a-ząćęłńóśźż]+/gu);
  const allowed = new Set(letters);
  const missing = [...new Set(words.join('').toLocaleUpperCase('pl'))].filter(letter => !allowed.has(letter));
  requireThat(!missing.length, 'Poza zestawem: ' + missing.join(', ') + '.');
  return { text, key: words.join(' '), unknown: [...new Set(words.filter(word => !dictionary.has(word)))] };
}

function fresh() {
  return { phase: 'lobby', settings: { seconds: 90, rounds: 3 }, number: 0, roundId: null,
    deadline: null, letters: [], entries: [], finished: [], reviewed: [], totals: {}, gained: {} };
}

function begin(room, now) {
  const g = room.game;
  requireThat(room.players.filter(p => p.online).length >= 2, 'Zbierz co najmniej dwie osoby przy stoliku.', 409);
  g.letters = drawLetters(g.letters);
  g.phase = 'writing';
  g.number += 1;
  g.roundId = randomUUID();
  g.deadline = now + g.settings.seconds * 1000;
  g.entries = [];
  g.finished = [];
  g.reviewed = [];
  g.gained = {};
}

function finishRound(room) {
  const g = room.game;
  g.phase = 'results';
  g.deadline = null;
  g.scorers = room.players.map(({ id, name }) => ({ id, name }));
  for (const entry of g.entries) {
    if (entry.status === 'pending') {
      const votes = Object.values(entry.votes);
      entry.status = votes.filter(Boolean).length > votes.length / 2 ? 'accepted' : 'rejected';
    }
    if (entry.status === 'accepted') g.gained[entry.author] = (g.gained[entry.author] || 0) + 1;
  }
  for (const [id, points] of Object.entries(g.gained)) g.totals[id] = (g.totals[id] || 0) + points;
}

function advance(room, now) {
  const g = room.game;
  if (g.phase === 'writing' && (now >= g.deadline || room.players.every(p => g.finished.includes(p.id)))) {
    if (g.entries.length) {
      g.phase = 'voting';
      g.deadline = now + voteTime;
    } else finishRound(room);
    return true;
  }
  if (g.phase === 'voting') {
    const allVoted = g.entries.filter(e => e.status === 'pending')
      .every(e => room.players.every(p => e.author === p.id || Object.hasOwn(e.votes, p.id)));
    const allReviewed = room.players.every(p => g.reviewed.includes(p.id) ||
      !g.entries.some(e => e.status === 'accepted' && e.author !== p.id));
    if (now >= g.deadline || (allVoted && allReviewed)) {
      finishRound(room);
      return true;
    }
  }
  return false;
}

function act(room, player, action, data, now) {
  const g = room.game;
  const host = ['settings', 'start', 'next', 'rematch'].includes(action);
  if (host) requireThat(room.hostId === player.id, 'Tę decyzję podejmuje gospodarz.', 403);
  requireThat(data.roundId === g.roundId, 'Runda już się zmieniła.', 409);
  switch (action) {
    case 'settings':
      requireThat(g.phase === 'lobby', 'Mecz już się zaczął.', 409);
      requireThat(durations.includes(data.seconds) && rounds.includes(data.rounds), 'Wybierz ustawienia z listy.');
      g.settings = { seconds: data.seconds, rounds: data.rounds };
      break;
    case 'start':
      requireThat(g.phase === 'lobby', 'Mecz już się zaczął.', 409);
      begin(room, now);
      break;
    case 'submit': {
      requireThat(g.phase === 'writing' && !g.finished.includes(player.id), 'Zapisywanie zdań jest już zamknięte.', 409);
      const submission = checkSentence(data.text, g.letters);
      requireThat(!g.entries.some(e => e.author === player.id && e.key === submission.key),
        'Masz już to zdanie na swojej liście.', 409);
      g.entries.push({ ...submission, id: randomUUID(), author: player.id, votes: {},
        status: submission.unknown.length ? 'pending' : 'accepted' });
      break;
    }
    case 'finish':
      requireThat(g.phase === 'writing', 'Czas na pisanie już minął.', 409);
      if (!g.finished.includes(player.id)) g.finished.push(player.id);
      break;
    case 'vote': {
      requireThat(g.phase === 'voting', 'Głosowanie jest zamknięte.', 409);
      const entry = g.entries.find(e => e.id === data.entryId && e.status === 'pending');
      requireThat(entry && typeof data.yes === 'boolean', 'Wybierz zdanie i głos.');
      requireThat(entry.author !== player.id, 'To Twoje zdanie. Głosują pozostali gracze.', 403);
      requireThat(!Object.hasOwn(entry.votes, player.id), 'Twój głos jest już zapisany.', 409);
      entry.votes[player.id] = data.yes;
      break;
    }
    case 'challenge': {
      requireThat(g.phase === 'voting', 'Ocena zdań jest zamknięta.', 409);
      const entry = g.entries.find(e => e.id === data.entryId && e.status === 'accepted');
      requireThat(entry, 'To zdanie już trafiło do oceny.', 409);
      requireThat(entry.author !== player.id, 'To Twoje zdanie.', 403);
      entry.status = 'pending';
      entry.challenged = true;
      entry.votes[player.id] = false;
      break;
    }
    case 'reviewed':
      requireThat(g.phase === 'voting', 'Ocena zdań jest zamknięta.', 409);
      requireThat(!g.entries.some(e => e.status === 'pending' && e.author !== player.id && !Object.hasOwn(e.votes, player.id)),
        'Najpierw oceń wszystkie sporne zdania.', 409);
      if (!g.reviewed.includes(player.id)) g.reviewed.push(player.id);
      break;
    case 'next':
      requireThat(g.phase === 'results' && g.number < g.settings.rounds, 'Kolejna runda jest niedostępna.', 409);
      begin(room, now);
      break;
    case 'rematch':
      requireThat(g.phase === 'results' && g.number === g.settings.rounds, 'Dokończ bieżący mecz.', 409);
      room.game = { ...fresh(), settings: g.settings };
      break;
    default:
      requireThat(false, 'Nieznany ruch.');
  }
  advance(room, now);
}

function playerLeft(room, id, now) {
  const g = room.game;
  if (g.phase === 'lobby') return;
  if (g.phase === 'results' && g.number === g.settings.rounds) return;
  if (room.players.length < 2) {
    room.game = { ...fresh(), settings: g.settings };
    room.notice = 'Do dalszej gry potrzeba dwóch osób. Możesz znów zaprosić znajomych tym samym kodem.';
    return;
  }
  if (g.phase === 'results') return;
  g.entries = g.entries.filter(e => e.author !== id);
  for (const e of g.entries) delete e.votes[id];
  advance(room, now);
}

function view(room, viewerId) {
  const g = room.game;
  const visible = g.entries.filter(e => g.phase === 'results' || g.phase === 'voting' || e.author === viewerId);
  return {
    phase: g.phase, settings: g.settings, number: g.number, roundId: g.roundId, deadline: g.deadline,
    letters: g.letters, finished: g.finished, reviewed: g.reviewed.includes(viewerId), totals: g.totals, gained: g.gained,
    scorers: g.phase === 'results' ? g.scorers : undefined,
    entries: visible.map(e => ({
      id: e.id, text: e.text, unknown: e.unknown, challenged: Boolean(e.challenged), status: e.status, mine: e.author === viewerId,
      author: g.phase === 'results' ? e.author : undefined,
      vote: Object.hasOwn(e.votes, viewerId) ? e.votes[viewerId] : null,
      yes: g.phase === 'results' ? Object.values(e.votes).filter(Boolean).length : undefined,
      no: g.phase === 'results' ? Object.values(e.votes).filter(v => !v).length : undefined,
    })),
  };
}

export const sentenceGame = { id: 'literowe-zdania', fresh, act, advance, playerLeft, view };
