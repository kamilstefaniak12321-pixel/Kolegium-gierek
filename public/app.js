import { catalog } from './catalog.js';
import { sentenceUI } from './games/literowe-zdania.js';
import { arrow, esc, icon } from './ui.js';

const games = { [sentenceUI.id]: sentenceUI };
const app = document.querySelector('#app');
const nav = document.querySelector('#nav');
const modal = document.querySelector('#modal');
const connection = document.querySelector('#connection');
const byId = id => document.getElementById(id);
const codeOf = value => String(value || '').trim().toUpperCase();
const validCode = value => /^[A-Z0-9]{6}$/u.test(value);
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

function read(store, key) {
  try { return JSON.parse(store.getItem(key)); } catch { return null; }
}
function write(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch { /* The tab also keeps its live session in memory. */ }
}

let session = null;
let state = null;
let controller = null;
let clockOffset = 0;
let message = '';
let busy = false;
let toastTimer;
let inviteBase = location.origin;
let joiningGame = 'literowe-zdania';
let draft = read(sessionStorage, 'kg-draft');

async function api(path, { method = 'GET', data, token, signal } = {}) {
  const headers = {};
  if (data) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(path, { method, headers, signal, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw Object.assign(new Error(details.error || 'Serwer jest chwilowo niedostępny.'), { status: response.status });
  }
  return response.json();
}

function say(text) {
  const toast = byId('toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3700);
}
function banner(text = '') {
  connection.textContent = text;
  connection.hidden = !text;
}
function friendly(error) {
  return error.status ? error.message : 'Brak połączenia z serwerem. Spróbuj ponownie.';
}
function setCode(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('pokoj', code);
  else url.searchParams.delete('pokoj');
  url.hash = '';
  history.replaceState(null, '', url);
}

function home() {
  document.title = 'Kolegium gierek';
  nav.innerHTML = '<a class="nav-current" href="#katalog">Katalog gier</a><a href="#dolacz" data-do="join-shortcut">Dołącz kodem</a>';
  app.innerHTML = `<div class="page-title" id="katalog"><h1>W co dziś gramy<span>?</span></h1>
    <p>Wybierz grę i zaproś znajomych do wspólnego pokoju.</p></div>
    <div class="catalog">${Object.values(catalog).map(g => `<article class="poster">
      <div class="poster-info"><div class="category"><span class="category-dot"></span>${esc(g.category)}</div>
      <h2>${esc(g.title)}</h2><p>${esc(g.summary)}</p>
      <div class="facts"><span>${icon('people')}${g.minPlayers}–${g.maxPlayers} osób</span><span>${icon('clock')}${esc(g.timeLabel)}</span></div>
      <div class="poster-buttons"><button data-do="create" data-game="${g.id}" class="btn golden">Utwórz pokój ${arrow}</button>
        <button data-do="rules" data-game="${g.id}" class="rules-link">Zasady gry</button></div>
      </div>${games[g.id].artwork()}</article>`).join('')}</div>
    <section class="join-strip" id="dolacz" aria-labelledby="join-title">
      <div class="join-lead"><div class="ticket-icon" aria-hidden="true"><i></i></div>
      <div><h2 id="join-title">Masz kod pokoju?</h2><p>Wpisz kod od znajomych i dosiądź się do gry.</p></div></div>
      <form id="quick-join"><label class="sr-only" for="quick-code">Sześcioznakowy kod pokoju</label>
      <input id="quick-code" class="code-field" name="code" placeholder="Kod pokoju" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="6" required>
      <button class="btn primary" type="submit">Dołącz ${arrow}</button></form>
    </section>`;
}

function showModal(body) {
  modal.innerHTML = `<button class="modal-x" aria-label="Zamknij" data-do="close" type="button">×</button>${body}`;
  if (!modal.open) modal.showModal();
  modal.querySelector('[data-focus]')?.focus();
}
function seatDialog(kind, code = '', gameId = 'literowe-zdania') {
  joiningGame = gameId;
  const create = kind === 'create';
  showModal(`<div class="modal-kicker">${create ? esc(catalog[gameId].title) : 'Kolegium gierek'}</div>
    <h2 id="modal-title">${create ? 'Utwórz pokój' : 'Dołącz do pokoju'}</h2>
    <p class="subtle">${create ? 'Za chwilę dostaniesz kod dla swojej ekipy.' : 'Usiądź przy tym samym stoliku co znajomi.'}</p>
    <form id="seat-form" data-kind="${kind}">
      ${create ? '' : `<label for="join-code">Kod pokoju</label><input id="join-code" name="code" class="code-field" value="${esc(code)}" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" required ${code ? '' : 'data-focus'}>`}
      <label for="nickname">Twój pseudonim</label><input id="nickname" name="name" maxlength="18" value="${esc(read(localStorage,'kg-name') || '')}" placeholder="Jak się nazywasz?" required autocomplete="nickname" ${create || code ? 'data-focus' : ''}>
      <p class="form-error" id="seat-error" role="alert" hidden></p>
      <button class="btn primary full" type="submit">${create ? 'Utwórz pokój' : 'Dołącz do gry'} ${arrow}</button>
    </form>`);
}
function rules(id) {
  const g = catalog[id];
  showModal(`<div class="modal-kicker">${esc(g.title)}</div><h2 id="modal-title">Zasady gry</h2>
    <ol class="rules-list">${g.rules.map(([title,text]) => `<li><strong>${esc(title)}</strong><p>${esc(text)}</p></li>`).join('')}</ol>
    <div class="example"><strong>Przykład</strong><p>Z liter A, K, L, M, O i T ułożysz „Ala ma kota”. To samo zdanie daje Ci punkt tylko raz w rundzie.</p></div>
    <button class="btn primary full" data-do="close">Rozumiem</button>`);
}
function confirmAction(kind) {
  const leave = kind === 'leave';
  showModal(`<h2 id="modal-title">${leave ? 'Opuścić pokój?' : 'Zakończyć pisanie?'}</h2>
    <p class="subtle">${leave ? 'Twoje miejsce zostanie zwolnione. Do trwającego meczu można wrócić dopiero w poczekalni.' : 'Twoje zdania są zapisane. Po potwierdzeniu poczekasz na pozostałych graczy.'}</p>
    <div class="form-actions"><button class="btn secondary" data-do="close" data-focus>Wróć</button>
    <button class="btn primary" data-do="${leave ? 'leave' : 'finish'}">${leave ? 'Opuść pokój' : 'Kończę pisanie'}</button></div>`);
}

function renderRoom(first = false) {
  const s = state;
  const g = s.game;
  const previous = document.activeElement;
  const focusId = previous?.id;
  const focusAction = previous?.dataset?.do;
  const focusEntry = previous?.dataset?.entry;
  const focusRadio = previous?.matches('input[type="radio"]') ? [previous.name,previous.value] : null;
  const expanded = byId('dictionary-entries')?.open;
  const selection = previous?.id === 'sentence' ? [previous.selectionStart, previous.selectionEnd] : null;
  const title = games[s.gameId].title(g);
  document.title = title + ' · Kolegium gierek';
  nav.innerHTML = '<button class="nav-link" data-do="rules">Zasady gry</button><button class="nav-link" data-do="leave-prompt">Opuść pokój</button>';
  app.innerHTML = `<div class="room-heading">
    <div><div class="room-game">${esc(catalog[s.gameId].title)}</div><h1>${esc(title)}</h1></div>
    <div class="room-ticket"><div><small>Kod pokoju</small><strong>${esc(s.code)}</strong></div>
    <button class="btn secondary slim" data-do="share">Zaproś ${arrow}</button></div></div>
    ${s.notice ? '<p class="room-notice">' + esc(s.notice) + '</p>' : ''}
    ${games[s.gameId].phases[g.phase](s)}`;
  if (expanded && byId('dictionary-entries')) byId('dictionary-entries').open = true;
  const field = byId('sentence');
  if (field && draft?.roundId === g.roundId) field.value = draft.text;
  if (field && message) { byId('sentence-error').textContent = message; byId('sentence-error').hidden = false; }
  updateClock();
  if (modal.open) return;
  if (first) {
    app.focus({ preventScroll: true });
    window.scrollTo(0,0);
  } else {
    let target = focusId && byId(focusId);
    if (!target && focusAction) {
      target = [...document.querySelectorAll('[data-do]')].find(el => el.dataset.do === focusAction && el.dataset.entry === focusEntry);
    }
    if (!target && focusRadio) target = app.querySelector('input[name="' + focusRadio[0] + '"][value="' + focusRadio[1] + '"]');
    target?.focus({ preventScroll: true });
    if (selection && target === field) field.setSelectionRange(...selection);
  }
}
function updateClock() {
  const clock = byId('clock');
  if (!clock || !state?.game.deadline) return;
  const seconds = Math.max(0, Math.ceil((state.game.deadline - (Date.now() + clockOffset)) / 1000));
  clock.textContent = Math.floor(seconds/60) + ':' + String(seconds % 60).padStart(2,'0');
  clock.parentElement.classList.toggle('urgent', seconds <= 10);
}
setInterval(updateClock, 250);

function apply(next) {
  if (!next?.game || next.code !== session?.code || (state && next.revision < state.revision)) return;
  clockOffset = next.now - Date.now();
  if (state?.revision === next.revision) { updateClock(); return; }
  const changedPhase = !state || state.game.phase !== next.game.phase || state.game.roundId !== next.game.roundId;
  if (!changedPhase && state.hostId === next.hostId && state.notice === next.notice &&
      JSON.stringify(state.players) === JSON.stringify(next.players) && JSON.stringify(state.game) === JSON.stringify(next.game)) {
    state = next;
    return;
  }
  if (changedPhase) {
    message = '';
    if (modal.open && !modal.querySelector('#modal-title')?.textContent.includes('Zasady')) modal.close();
  }
  state = next;
  renderRoom(changedPhase);
}
function resetSession() {
  controller?.abort();
  session = null;
  state = null;
  message = '';
  write(sessionStorage,'kg-session',null);
  setCode('');
  if (modal.open) modal.close();
  banner();
  home();
  app.focus({ preventScroll: true });
  window.scrollTo(0,0);
}
async function watch(current) {
  let retry = 500;
  while (session === current) {
    controller = new AbortController();
    try {
      const after = state ? '?after=' + state.revision : '';
      const next = await api('/api/rooms/' + current.code + '/state' + after, { token: current.token, signal: controller.signal });
      if (session !== current) return;
      banner();
      retry = 500;
      apply(next);
    } catch (error) {
      if (session !== current) return;
      if (error.name === 'AbortError') continue;
      if ([401,404].includes(error.status)) { resetSession(); say(error.message); return; }
      banner('Łączenie z pokojem… Gra wznowi się po odzyskaniu połączenia.');
      await new Promise(resolve => setTimeout(resolve, retry));
      retry = Math.min(5000, retry * 2);
    }
  }
}
function enter(saved, initial) {
  controller?.abort();
  session = { code: saved.code, token: saved.token };
  write(sessionStorage,'kg-session',session);
  setCode(session.code);
  if (modal.open) modal.close();
  if (initial) apply(initial);
  else {
    app.innerHTML = '<section class="panel"><h1>Łączenie z pokojem…</h1><p class="subtle">Odzyskujemy Twoje miejsce przy stole.</p><button class="btn secondary" data-do="forget">Wróć do katalogu</button></section>';
  }
  void watch(session);
}
async function step(action, extra = {}) {
  if (busy || !session || !state) return;
  const current = session;
  busy = true;
  try {
    const next = await api('/api/rooms/' + current.code + '/action', { method: 'POST', token: current.token,
      data: { action, roundId: state.game.roundId, ...extra } });
    if (session !== current) return;
    if (action === 'leave') return resetSession();
    if (action === 'submit') {
      if (draft?.text === extra.text) {
        draft = null;
        write(sessionStorage, 'kg-draft', null);
        const field = byId('sentence');
        if (field) field.value = '';
      }
      message = '';
      say('Zdanie zapisane.');
    }
    if (modal.open) modal.close();
    apply(next);
  } catch (error) {
    if (session !== current) return;
    if ([401,404].includes(error.status)) { resetSession(); say(error.message); return; }
    if (action === 'submit' && byId('sentence-error')) {
      message = friendly(error);
      byId('sentence-error').textContent = message;
      byId('sentence-error').hidden = false;
    } else { say(friendly(error)); if (action === 'settings') renderRoom(); }
  } finally { busy = false; }
}
async function share() {
  const link = new URL('/', inviteBase);
  link.searchParams.set('pokoj', state.code);
  try {
    if (navigator.share) { await navigator.share({ title: 'Kolegium gierek', text: 'Dołącz do mojego pokoju ' + state.code, url: link.href }); return; }
    if (navigator.clipboard) { await navigator.clipboard.writeText(link.href); say('Link do pokoju skopiowany.'); return; }
  } catch (error) { if (error.name === 'AbortError') return; }
  showModal(`<h2 id="modal-title">Zaproś znajomych</h2><p class="subtle">Wyślij ten link lub podaj kod <strong>${esc(state.code)}</strong>.</p>
    <label for="invite-link">Link do pokoju</label><input id="invite-link" value="${esc(link.href)}" readonly data-focus>
    <button class="btn primary full" data-do="close">Gotowe</button>`);
  byId('invite-link').select();
}

document.addEventListener('click', event => {
  const item = event.target.closest('[data-do]');
  if (!item) return;
  event.preventDefault();
  const action = item.dataset.do;
  switch (action) {
    case 'home': if (state) confirmAction('leave'); else resetSession(); break;
    case 'forget': resetSession(); break;
    case 'join-shortcut': byId('dolacz').scrollIntoView({ block: 'center' }); byId('quick-code').focus({ preventScroll: true }); break;
    case 'create': seatDialog('create','',item.dataset.game); break;
    case 'rules': rules(item.dataset.game || state?.gameId || joiningGame); break;
    case 'close': modal.close(); break;
    case 'share': void share(); break;
    case 'finish-prompt': confirmAction('finish'); break;
    case 'leave-prompt': confirmAction('leave'); break;
    case 'vote-yes': case 'vote-no': void step('vote',{ entryId: item.dataset.entry, yes: action === 'vote-yes' }); break;
    case 'challenge': void step('challenge',{ entryId: item.dataset.entry }); break;
    default: void step(action);
  }
});
modal.addEventListener('click', event => {
  if (event.target !== modal) return;
  const box = modal.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) modal.close();
});
document.addEventListener('input', event => {
  const el = event.target;
  if (el.name === 'code') { el.value = codeOf(el.value); el.setCustomValidity(''); }
  if (el.id !== 'sentence') return;
  draft = { roundId: state.game.roundId, text: el.value };
  write(sessionStorage,'kg-draft',draft);
  message = '';
  byId('sentence-error').hidden = true;
});
document.addEventListener('change', event => {
  const name = event.target.name;
  if (['seconds','rounds'].includes(name)) void step('settings',{ ...state.game.settings, [name]: Number(event.target.value) });
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'sentence' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    byId('sentence-form').requestSubmit();
  }
});
document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  if (form.id === 'sentence-form') return void step('submit',{ text: data.sentence });
  if (Object.hasOwn(data,'code') && !validCode(codeOf(data.code))) {
    form.elements.code.setCustomValidity('Kod pokoju składa się z sześciu liter lub cyfr.');
    return form.elements.code.reportValidity();
  }
  if (form.id === 'quick-join') return seatDialog('join',codeOf(data.code));
  if (form.id !== 'seat-form' || busy) return;
  busy = true;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const path = form.dataset.kind === 'create' ? '/api/rooms' : '/api/rooms/' + codeOf(data.code) + '/join';
    const result = await api(path,{ method: 'POST', data: { name: data.name, gameId: joiningGame } });
    write(localStorage,'kg-name',data.name.trim());
    enter(result,result.state);
  } catch (error) {
    const seatError = form.querySelector('#seat-error');
    seatError.textContent = friendly(error);
    seatError.hidden = false;
  } finally { busy = false; button.disabled = false; }
});

const invite = codeOf(new URLSearchParams(location.search).get('pokoj'));
const saved = read(sessionStorage,'kg-session');
if (saved?.token && validCode(saved.code) && (!invite || saved.code === invite)) enter(saved);
else {
  home();
  if (validCode(invite)) seatDialog('join',invite);
}
if (loopback) api('/api/lan').then(data => { if (data.origin) inviteBase = data.origin; }).catch(() => {});
window.addEventListener('online', () => { if (session) controller?.abort(); else banner(); });
window.addEventListener('offline', () => banner('Brak połączenia. Gra ze znajomymi wymaga dostępu do serwera.'));
document.addEventListener('visibilitychange', () => { if (!document.hidden && session) controller?.abort(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
