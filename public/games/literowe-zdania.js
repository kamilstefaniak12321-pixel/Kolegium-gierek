import { arrow, avatar, disabled, esc, gameArt, icon, playerList } from '../ui.js';
import { catalog } from '../catalog.js';

const durationOptions = [60, 90, 120];
const roundOptions = [1, 3, 5];

function choices(name, items, selected, suffix, editable) {
  return '<div class="segmented">' + items.map(n => `<label class="choice">
    <input type="radio" name="${name}" value="${n}" ${n === selected ? 'checked' : ''}${disabled(!editable)}>
    <span>${n}${suffix}</span></label>`).join('') + '</div>';
}

function lobby(s) {
  const host = s.me === s.hostId;
  const online = s.players.filter(p => p.online).length;
  return `<div class="room-columns">
    <section class="panel"><div class="panel-head"><h2>Gracze przy stole</h2><span class="count">${s.players.length} / ${catalog[s.gameId].maxPlayers}</span></div>
      ${playerList(s)}<p class="subtle note">${online < 2 ? 'Zaproś jeszcze jedną osobę, żeby rozpocząć.' : 'Ekipa w komplecie? Możecie już zaczynać.'}</p>
    </section>
    <section class="panel settings"><h2>Ustawienia meczu</h2>
      <fieldset><legend>Czas na zdania</legend>${choices('seconds',durationOptions,s.game.settings.seconds,' s',host)}</fieldset>
      <fieldset><legend>Liczba rund</legend>${choices('rounds',roundOptions,s.game.settings.rounds,'',host)}</fieldset>
      ${host ? `<button class="btn primary full" data-do="start"${disabled(online < 2)}>Rozpocznij grę ${arrow}</button>`
        : '<p class="note">Gospodarz rozpocznie grę, gdy wszyscy dołączą.</p>'}
    </section></div>`;
}

function timer() {
  return `<div class="timer" role="timer" aria-label="Pozostały czas">${icon('clock')}<strong id="clock">--:--</strong></div>`;
}

function writing(s) {
  const g = s.game;
  const done = g.finished.includes(s.me);
  return `<section class="letter-board">
      <div class="panel-head"><h2>Wasze litery</h2>${timer()}</div>
      <div class="letters" aria-label="Wylosowane litery">${g.letters.map(l => '<span class="letter">' + esc(l) + '</span>').join('')}</div>
      <p>Każdej litery możesz użyć wielokrotnie. Ułóż zdanie z co najmniej dwóch słów.</p>
    </section>
    <div class="room-columns writing-columns"><section class="panel">
      ${done ? '<h2>Zdania oddane</h2><p class="note">Runda zakończy się, gdy skończą pozostali gracze lub upłynie czas.</p>'
        : `<form id="sentence-form"><label class="h2-label" for="sentence">Twoje zdanie</label>
        <textarea id="sentence" name="sentence" rows="2" maxlength="160" placeholder="Wpisz zdanie z wylosowanych liter…" required></textarea>
        <p id="sentence-error" class="form-error" role="alert" hidden></p>
        <div class="form-actions"><button class="btn primary" type="submit">Dodaj zdanie ${arrow}</button>
        <button class="btn text-btn" type="button" data-do="finish-prompt">Kończę pisanie</button></div></form>`}
    </section><section class="panel"><div class="panel-head"><h2>Twoja lista</h2><span class="count">${g.entries.length}</span></div>
      ${g.entries.length ? `<ul class="entry-list">${[...g.entries].reverse().map(e => `<li><strong>${esc(e.text)}</strong>
        <span class="entry-status ${e.status}">${e.status === 'accepted' ? 'Uznane przez słownik' : 'Do głosowania'}</span></li>`).join('')}</ul>`
        : '<p class="subtle">Tutaj pojawi się Twoje pierwsze zdanie.</p>'}
    </section></div>`;
}

function voting(s) {
  const entries = s.game.entries.filter(e => e.status === 'pending');
  const known = s.game.entries.filter(e => e.status === 'accepted');
  const remaining = entries.filter(e => !e.mine && e.vote === null).length;
  return `<section class="panel"><div class="panel-head"><h2>Głosowanie</h2>${timer()}</div>
    <p class="subtle">Oceń, czy zdanie ma sens i czy użyte słowa są poprawne.</p>
    <p class="vote-counter">${remaining ? 'Twoje zdania do oceny: ' + remaining : 'W tej chwili nie masz spornych zdań do oceny.'}</p>
    <ul class="ballots">${entries.map(e => `<li><div><h3>${esc(e.text)}</h3>
      <p class="subtle small">${e.challenged ? 'Zgłoszone przez gracza' : 'Poza słownikiem: ' + e.unknown.map(esc).join(', ')}</p></div>
      ${e.mine ? '<span class="tag">Twoje zdanie</span>' : e.vote !== null
        ? `<span class="tag">Twój głos: ${e.vote ? 'uznaję' : 'odrzucam'}</span>`
        : `<div class="vote-buttons"><button class="btn secondary slim" data-do="vote-no" data-entry="${esc(e.id)}">Odrzucam</button>
        <button class="btn primary slim" data-do="vote-yes" data-entry="${esc(e.id)}">Uznaję</button></div>`}
      </li>`).join('')}</ul>
    ${known.length ? `<details id="dictionary-entries" class="dictionary-entries"><summary>Zdania uznane przez słownik (${known.length})</summary>
      <p class="subtle small">Jeśli zdanie nie ma sensu, możesz przekazać je do głosowania. Zgłoszenie jest Twoim głosem przeciw.</p>
      <ul class="ballots">${known.map(e => `<li><strong>${esc(e.text)}</strong>${e.mine ? '<span class="tag">Twoje zdanie</span>'
        : `<button class="btn secondary slim" data-do="challenge" data-entry="${esc(e.id)}">Zgłoś do oceny</button>`}</li>`).join('')}</ul></details>` : ''}
    ${known.some(e => !e.mine) && !s.game.reviewed
      ? `<button class="btn primary" data-do="reviewed"${disabled(remaining > 0)}>Kończę ocenę</button>`
      : '<p class="note">Wyniki pojawią się po ocenie przez grupę lub po upływie czasu.</p>'}
    </section>`;
}

function results(s) {
  const g = s.game;
  const final = g.number === g.settings.rounds;
  const ranked = [...g.scorers].sort((a,b) => (g.totals[b.id] || 0) - (g.totals[a.id] || 0));
  const top = g.totals[ranked[0].id] || 0;
  const leaders = ranked.filter(p => (g.totals[p.id] || 0) === top);
  const title = top === 0 ? 'Remis bez punktów' : leaders.length > 1 ? 'Remis na szczycie!' : 'Wygrywa ' + leaders[0].name + '!';
  const detail = leaders.length > 1 && top > 0 ? leaders.map(p => p.name).join(', ') + ' · ' : '';
  let lastScore = -1;
  let rank = 0;
  return `<div class="room-columns"><section class="panel">
    <h2>${final ? esc(title) : 'Wyniki po rundzie ' + g.number}</h2>
    <p class="subtle">${final ? esc(detail) + 'Koniec meczu. Każde uznane zdanie to jeden punkt.' : 'Wynik łączny obejmuje wszystkie rozegrane rundy.'}</p>
    <ol class="scores">${ranked.map((p, i) => {
      const score = g.totals[p.id] || 0;
      if (score !== lastScore) { rank = i + 1; lastScore = score; }
      return `<li><span class="place">${rank}.</span>${avatar(g.scorers.findIndex(person => person.id === p.id))}
        <span class="player-name">${esc(p.name)}${p.id === s.me ? '<small> (Ty)</small>' : ''}<small>+${g.gained[p.id] || 0} w rundzie</small></span>
        <strong class="points">${score} pkt</strong></li>`;
    }).join('')}</ol>
    ${s.me === s.hostId ? `<button class="btn primary full" data-do="${final ? 'rematch' : 'next'}">${final ? 'Rewanż w tym pokoju' : 'Rozpocznij kolejną rundę'} ${arrow}</button>`
      : '<p class="note">Gospodarz może rozpocząć ' + (final ? 'rewanż.' : 'kolejną rundę.') + '</p>'}
    </section><section class="panel"><div class="panel-head"><h2>Zdania z rundy</h2><span class="count">${g.entries.length}</span></div>
    ${g.entries.length ? `<ul class="entry-list">${g.entries.map(e => `<li><strong>${esc(e.text)}</strong>
      <span class="small subtle">${esc(g.scorers.find(p => p.id === e.author)?.name)}</span>
      <span class="entry-status ${e.status}">${e.status === 'accepted' ? '+1 pkt' : '0 pkt'} · ${e.unknown.length || e.challenged ? 'za ' + e.yes + ', przeciw ' + e.no : 'słownik'}</span></li>`).join('')}</ul>`
      : '<p class="subtle">W tej rundzie nikt nie oddał zdania.</p>'}
    </section></div>`;
}

export const sentenceUI = {
  id: 'literowe-zdania',
  artwork: gameArt,
  title(g) {
    return { lobby: 'Poczekalnia', writing: 'Runda ' + g.number + ' z ' + g.settings.rounds,
      voting: 'Ocena zdań', results: g.number === g.settings.rounds ? 'Wyniki meczu' : 'Podsumowanie rundy' }[g.phase];
  },
  phases: { lobby, writing, voting, results },
};
