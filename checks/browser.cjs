const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const { mkdir } = require('node:fs/promises');
const { join } = require('node:path');

async function screenshot(page, name) {
  const folder = process.env.KG_PREVIEW_DIR;
  if (!folder) return;
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: join(folder, name), fullPage: true });
}

async function run() {
  const { createServer } = await import('../src/server.js');
  const { starterSentences } = await import('../src/games/literowe-zdania.js');
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const phone = await browser.newContext(devices['Pixel 7']);
    const host = await desktop.newPage();
    const guest = await phone.newPage();
    const errors = [];
    for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
    await Promise.all([host.goto(origin), guest.goto(origin)]);
    const button = (page, name) => page.getByRole('button', { name, exact: true });
    const heading = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor();
    async function checkWidth(page) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'poziomy przewijany ekran');
    }
    await heading(host, 'Literowe zdania');
    await checkWidth(guest);
    await screenshot(host, 'katalog-komputer.png');
    await screenshot(guest, 'katalog-telefon.png');
    await button(host, 'Utwórz pokój').click();
    await host.getByLabel('Twój pseudonim').fill('Kamil');
    await button(host.locator('dialog'), 'Utwórz pokój').click();
    await heading(host, 'Poczekalnia');
    const code = await host.locator('.room-ticket strong').textContent();
    await guest.getByRole('link', { name: 'Dołącz kodem' }).click();
    await guest.locator('#quick-code').fill(code.toLowerCase());
    await button(guest, 'Dołącz').click();
    await guest.getByLabel('Twój pseudonim').fill('Madzia');
    await button(guest.locator('dialog'), 'Dołącz do gry').click();
    await heading(guest, 'Poczekalnia');
    await host.getByText('Madzia', { exact: true }).waitFor();
    await host.locator('label:has(input[name="rounds"][value="1"])').click();
    await guest.waitForFunction(() => document.querySelector('input[name="rounds"][value="1"]').checked);
    await button(host, 'Rozpocznij grę').click();
    await Promise.all([heading(host, 'Runda 1 z 1'), heading(guest, 'Runda 1 z 1')]);
    await checkWidth(guest);
    await screenshot(guest, 'runda-telefon.png');
    const letters = await host.locator('.letter').allTextContents();
    assert.deepEqual(await guest.locator('.letter').allTextContents(), letters);
    const known = starterSentences.find(text => [...text.toUpperCase()].every(c => c === ' ' || letters.includes(c)));
    assert.ok(known);
    const unknown = known + ' ' + letters.slice(0, 4).join('').toLowerCase().repeat(2);
    await host.getByLabel('Twoje zdanie').fill(unknown);
    await guest.getByLabel('Twoje zdanie').fill(known);
    await button(guest, 'Dodaj zdanie').click();
    await guest.getByText('Uznane przez słownik', { exact: true }).waitFor();
    assert.equal(await host.getByLabel('Twoje zdanie').inputValue(), unknown);
    assert.equal(await host.locator('.entry-list li').count(), 0);
    await host.reload();
    await heading(host, 'Runda 1 z 1');
    assert.equal(await host.getByLabel('Twoje zdanie').inputValue(), unknown);
    await button(host, 'Dodaj zdanie').click();
    await host.getByText('Do głosowania', { exact: true }).waitFor();
    for (const page of [host, guest]) {
      await button(page, 'Kończę pisanie').click();
      await button(page.locator('dialog'), 'Kończę pisanie').click();
    }
    await Promise.all([heading(host, 'Ocena zdań'), heading(guest, 'Ocena zdań')]);
    await checkWidth(guest);
    await button(guest, 'Uznaję').click();
    await button(host, 'Kończę ocenę').click();
    await Promise.all([heading(host, 'Wyniki meczu'), heading(guest, 'Wyniki meczu')]);
    assert.deepEqual(await guest.locator('.points').allTextContents(), ['1 pkt', '1 pkt']);
    await heading(host, 'Remis na szczycie!');
    await checkWidth(guest);
    await button(host, 'Rewanż w tym pokoju').click();
    await heading(guest, 'Poczekalnia');
    assert.equal(await guest.locator('.room-ticket strong').textContent(), code);
    const friend = await browser.newPage();
    await friend.goto(origin + '/?pokoj=' + code);
    await heading(friend, 'Dołącz do pokoju');
    assert.equal(await friend.getByLabel('Kod pokoju', { exact: true }).inputValue(), code);
    assert.deepEqual(errors, []);
    console.log('Pełny mecz w dwóch przeglądarkach, układ mobilny, powrót po odświeżeniu i zaproszenie przeszły test.');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
