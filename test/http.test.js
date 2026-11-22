import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

test('dwa osobne klienty HTTP rozgrywają mecz z kodem, odświeżeniem i głosem', { timeout: 10_000 }, async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function req(path, data, token) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (data) headers['Content-Type'] = 'application/json';
    const result = await fetch(origin + path,{ method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined });
    return { status: result.status, json: await result.json() };
  }
  for (const asset of ['/', '/app.js', '/style.css', '/manifest.webmanifest','/icon-192.png','/icon-512.png','/sw.js']) {
    const result = await fetch(origin + asset);
    assert.equal(result.status,200,asset);
    assert.ok((await result.arrayBuffer()).byteLength > 0);
  }
  const created = await req('/api/rooms',{ name:'Kamil',gameId:'literowe-zdania' });
  assert.equal(created.status,201);
  const host = created.json;
  const path = '/api/rooms/' + host.code;
  const waiting = req(path + '/state?after=' + host.state.revision,null,host.token);
  const mobile = (await req(path + '/join',{ name:'Madzia' })).json;
  assert.equal((await waiting).json.players.length,2);
  assert.equal((await req(path + '/state')).status,401);
  assert.equal((await req(path + '/state',null,mobile.token)).json.me,mobile.state.me);
  assert.equal((await req(path + '/action',{ action:'start', roundId:null },mobile.token)).status,403);
  await req(path + '/action',{ action:'settings', rounds:1, seconds:60, roundId:null },host.token);
  const start = (await req(path + '/action',{ action:'start', roundId:null },host.token)).json;
  const { roundId, letters } = start.game;
  const playing = (await req(path + '/state',null,mobile.token)).json;
  assert.deepEqual(playing.game.letters, letters);
  assert.equal(playing.game.deadline, start.game.deadline);
  // A deliberately unknown word made only of tiles sends this sentence to the other player.
  const text = letters.join('').toLowerCase() + ' ' + letters[0].repeat(3);
  const action = (player, action, extra = {}) => req(path + '/action',{ action, roundId, ...extra },player.token);
  assert.equal((await action(host,'submit',{ text })).json.game.entries[0].status,'pending');
  assert.equal((await req(path + '/state',null,mobile.token)).json.game.entries.length,0);
  await action(host,'finish');
  const review = (await action(mobile,'finish')).json;
  assert.equal(review.game.phase,'voting');
  const results = (await action(mobile,'vote',{ entryId:review.game.entries[0].id,yes:true })).json;
  assert.equal(results.game.phase,'results');
  assert.equal(results.game.totals[host.state.me],1);
  assert.deepEqual((await req(path + '/state',null,host.token)).json.game.totals, results.game.totals);
  const snapshot = JSON.stringify(results);
  assert.ok(!snapshot.includes(host.token) && !snapshot.includes(mobile.token));
});
