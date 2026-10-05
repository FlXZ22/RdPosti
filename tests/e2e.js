// Test end-to-end nel browser (Chromium via Playwright).
// Esegui con: npm run test:e2e   (richiede Playwright installato)
const assert = require('node:assert');
const path = require('node:path');

function loadPlaywright() {
  for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(id); } catch (e) { /* prova il prossimo */ }
  }
  console.error('Playwright non trovato: installalo con "npm i -D playwright"');
  process.exit(1);
}

const PAGE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const NAMES = ['Mario Rossi', 'Giulia Bianchi', 'Luca Verdi', 'Anna Neri', 'Marco Gallo', 'Sara Costa', 'Paolo Fontana',
  'Elena Conti', 'Davide Ricci', 'Chiara Greco', 'Simone Bruno', 'Laura Marino', 'Andrea Colombo', 'Francesca Romano',
  'Matteo Lombardi', 'Alessia Moretti', 'Federico Barbieri', 'Martina Esposito', 'Riccardo De Luca', 'Giorgia Mancini',
  'Lorenzo Rizzo', 'Sofia Ferrari', 'Tommaso Galli', 'Beatrice Leone'];

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(PAGE_URL);

  const results = [];
  const step = async (name, fn) => {
    try { await fn(); results.push(['ok', name]); }
    catch (e) { results.push(['FAIL', name + ': ' + e.message]); }
  };
  const desks = () => page.locator('.item.desk').count();
  const picked = () => page.locator('.item.picked').count();
  const cell = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#roomGrid')).getPropertyValue('--cell')));
  const grid = await page.locator('#roomGrid').boundingBox();
  const posOf = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((n) => n.style.left + ',' + n.style.top).sort().join(' '), sel);
  const status = () => page.locator('#rulesStatus').textContent();

  await step('favicon e font del logo', async () => {
    const icons = await page.evaluate(() => [...document.querySelectorAll('link[rel~=icon]')].map((l) => l.getAttribute('href')));
    assert.ok(icons.includes('assets/favicon.png'));
    const ok = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check("16px 'Della Respira'"); });
    assert.ok(ok);
  });

  await step('aula vuota con suggerimento centrale', async () => {
    assert.strictEqual(await desks(), 0);
    assert.ok(await page.locator('#roomEmpty').isVisible());
  });

  await step('trascina un banco dall’inventario', async () => {
    const inv = await page.locator('.inv-item[data-type=desk]').boundingBox();
    await page.mouse.move(inv.x + 20, inv.y + 20);
    await page.mouse.down();
    await page.mouse.move(grid.x + cell * 5.5, grid.y + cell * 5.5, { steps: 10 });
    await page.mouse.up();
    assert.strictEqual(await desks(), 1);
    assert.ok(await page.locator('#roomEmpty').isHidden());
  });

  await step('banchi vicini si uniscono (Union-Find)', async () => {
    await page.mouse.dblclick(grid.x + cell * 6.5, grid.y + cell * 5.5);
    assert.strictEqual(await desks(), 2);
    assert.match(await page.locator('#stats').textContent(), /2 banchi · 1 gruppi/);
  });

  await step('preset "File da 3": 2 colonne da 3 × 4 file', async () => {
    await page.click('[data-preset=triples]');
    assert.strictEqual(await desks(), 24);
    assert.match(await page.locator('#stats').textContent(), /24 banchi · 8 gruppi · 4 file/);
    assert.strictEqual(await page.locator('.item.teacher').count(), 1);
  });

  await step('rettangolo di selezione', async () => {
    await page.mouse.move(grid.x + 3, grid.y + cell * 1.5);
    await page.mouse.down();
    await page.mouse.move(grid.x + cell * 4.6, grid.y + cell * 2.6, { steps: 8 });
    await page.mouse.up();
    assert.strictEqual(await picked(), 3);
    assert.strictEqual(await page.locator('#selCount').textContent(), '3 selezionati');
  });

  await step('sposta la selezione trascinando e con le frecce', async () => {
    const before = await posOf('.item.picked');
    const b = await page.locator('.item.picked').first().boundingBox();
    await page.mouse.move(b.x + 10, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + 10, b.y + 10 + cell, { steps: 8 });
    await page.mouse.up();
    assert.notStrictEqual(await posOf('.item.picked'), before);
    await page.keyboard.press('ArrowUp');
    assert.strictEqual(await posOf('.item.picked'), before);
  });

  await step('duplica la selezione (bottone)', async () => {
    const n = await desks();
    await page.click('#selDuplicate');
    assert.strictEqual(await desks(), n + 3);
    assert.strictEqual(await picked(), 3, 'le copie restano selezionate');
    // le copie non devono unirsi ad altri banchi: un gruppo in più
    assert.match(await page.locator('#stats').textContent(), /27 banchi · 9 gruppi/);
  });

  await step('duplica con Ctrl+D e con clic destro', async () => {
    const n = await desks();
    await page.keyboard.press('Control+d');
    assert.strictEqual(await desks(), n + 3);
    await page.keyboard.press('Escape');
    await page.locator('.item.desk').first().click({ button: 'right' });
    assert.strictEqual(await desks(), n + 4);
  });

  await step('elimina con Canc', async () => {
    const n = await desks();
    assert.strictEqual(await picked(), 1);
    await page.keyboard.press('Delete');
    assert.strictEqual(await desks(), n - 1);
  });

  await step('Shift+clic e trascina fuori per rimuovere', async () => {
    const d = page.locator('.item.desk');
    const n = await desks();
    await d.nth(0).click({ modifiers: ['Shift'] });
    await d.nth(1).click({ modifiers: ['Shift'] });
    assert.strictEqual(await picked(), 2);
    const b = await d.nth(0).boundingBox();
    await page.mouse.move(b.x + 10, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(1300, 960, { steps: 10 });
    await page.mouse.up();
    assert.strictEqual(await desks(), n - 2);
  });

  await step('doppio clic rimuove un banco', async () => {
    const n = await desks();
    await page.locator('.item.desk').first().dblclick();
    assert.strictEqual(await desks(), n - 1);
  });

  await step('nomi → tabella compilata', async () => {
    await page.click('[data-preset=triples]');
    await page.fill('#namesInput', NAMES.join(', '));
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('#namesBody tr').count(), 24);
    assert.match(await page.locator('#count').textContent(), /24 studenti · 24 banchi · perfetto/);
  });

  await step('regole colorate + generazione che le rispetta', async () => {
    await page.click('#rulesToggle');
    const add = async (a, type, b) => {
      await page.click(`.type-opt[data-type=${type}]`);
      await page.selectOption('#ruleA', a);
      if (b) await page.selectOption('#ruleB', b);
      await page.click('#ruleForm button[type=submit]');
    };
    await add('Mario Rossi', 'separa', 'Luca Verdi');
    await add('Mario Rossi', 'separa', 'Giulia Bianchi');
    await add('Anna Neri', 'vicini', 'Sara Costa');
    await add('Paolo Fontana', 'prima');
    await add('Davide Ricci', 'noPrima');
    await add('Elena Conti', 'ultima');
    await add('Chiara Greco', 'noUltima');
    assert.strictEqual(await page.locator('#ruleList li[data-rule]').count(), 7);
    const colors = await page.evaluate(() => [...document.querySelectorAll('#ruleList li[data-rule]')].map((li) => getComputedStyle(li).getPropertyValue('--rc').trim()));
    assert.strictEqual(new Set(colors).size, 6, 'un colore per tipo di regola');
    for (let i = 0; i < 10; i++) {
      await page.click('#btnGenerate');
      assert.match(await status(), /tutte rispettate/, `tentativo ${i + 1}`);
    }
    assert.strictEqual(await page.locator('.desk.filled').count(), 24);
  });

  await step('scambio manuale ricontrolla le regole', async () => {
    const before = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('rdposti:v1')).assign));
    const d = page.locator('.desk.filled');
    await d.nth(0).click();
    await d.nth(23).click();
    const after = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('rdposti:v1')).assign));
    assert.notStrictEqual(before, after);
    assert.ok((await status()).length > 0);
  });

  await step('salvataggio dopo ricarica', async () => {
    await page.reload();
    assert.strictEqual(await page.locator('.desk.filled').count(), 24);
    assert.strictEqual(await page.locator('#rulesBadge').textContent(), '7');
  });

  await step('stampa su UNA pagina', async () => {
    for (const preset of ['triples', 'islands', 'horseshoe']) {
      await page.emulateMedia({ media: 'screen' });
      await page.click(`[data-preset=${preset}]`);
      await page.click('#btnGenerate');
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      assert.strictEqual(pages, 1, `${preset}: ${pages} pagine`);
    }
    await page.emulateMedia({ media: 'screen' });
  });

  await step('analytics da file://: nessuno script, eventi solo in coda e senza nomi', async () => {
    const scripts = await page.evaluate(() => [...document.scripts].map((x) => x.src).filter((x) => /vercel/.test(x)));
    assert.deepStrictEqual(scripts, []);
    const queued = await page.evaluate(() => JSON.stringify(window.vaq || []));
    // la coda riparte a ogni ricarica: qui ci sono gli eventi dopo l'ultimo reload
    assert.match(queued, /Genera disposizione/);
    assert.match(queued, /Disposizione rapida/);
    for (const name of NAMES) for (const part of name.split(' ')) assert.ok(!queued.includes(part), `nome nei dati: ${part}`);
  });

  // Serve i file del progetto da un dominio finto, come se fosse il deploy su Vercel
  const fs = require('node:fs');
  const ROOT = path.resolve(__dirname, '..');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf' };
  const FAKE_VA = 'window.__vaLoaded = true; window.__vaSeen = (window.vaq || []).map((a) => Array.from(a)); window.va = function () { window.__vaSeen.push(Array.from(arguments)); };';
  const FAKE_SI = 'window.__siLoaded = true;';
  const isVercelScript = (u) => u.pathname.startsWith('/_vercel/') || u.hostname === 'va.vercel-scripts.com';
  async function servePage(origin) {
    const p = await browser.newPage();
    const hits = [];
    await p.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (isVercelScript(u)) {
        hits.push(u.href);
        return route.fulfill({ contentType: 'text/javascript', body: u.pathname.includes('speed-insights') ? FAKE_SI : FAKE_VA });
      }
      if (u.origin !== origin) return route.abort();
      const file = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await p.goto(origin + '/');
    await p.waitForFunction(() => window.__vaLoaded === true && window.__siLoaded === true);
    return { p, hits };
  }

  await step('analytics in produzione: carica Web Analytics + Speed Insights e invia eventi', async () => {
    const { p, hits } = await servePage('https://rdposti.vercel.app');
    assert.deepStrictEqual(hits.sort(), [
      'https://rdposti.vercel.app/_vercel/insights/script.js',
      'https://rdposti.vercel.app/_vercel/speed-insights/script.js',
    ]);
    const tags = await p.evaluate(() => ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']
      .map((src) => { const s = document.querySelector(`script[src="${src}"]`); return s && s.defer; }));
    assert.deepStrictEqual(tags, [true, true], 'script con defer');
    assert.strictEqual(await p.evaluate(() => document.querySelector('script[src*="speed-insights"]').dataset.route), '/');
    p.on('dialog', (d) => d.accept());
    await p.click('[data-preset=triples]');
    await p.fill('#namesInput', NAMES.join(', '));
    await p.waitForTimeout(300);
    await p.click('#rulesToggle');
    await p.click('.type-opt[data-type=separa]');
    await p.selectOption('#ruleA', 'Mario Rossi');
    await p.selectOption('#ruleB', 'Luca Verdi');
    await p.click('#ruleForm button[type=submit]');
    await p.click('#btnGenerate');
    const seen = await p.evaluate(() => window.__vaSeen);
    const rule = seen.find((a) => a[0] === 'event' && a[1].name === 'Regola aggiunta');
    assert.deepStrictEqual(rule && rule[1].data, { tipo: 'separa' });
    const gen = seen.find((a) => a[0] === 'event' && a[1].name === 'Genera disposizione');
    assert.ok(gen, 'evento Genera disposizione');
    assert.deepStrictEqual(Object.keys(gen[1].data).sort(), ['banchi', 'regole', 'studenti', 'violazioni']);
    assert.strictEqual(gen[1].data.studenti, 24);
    assert.ok(Object.values(gen[1].data).every((v) => typeof v === 'number'));
    const all = JSON.stringify(seen);
    for (const name of NAMES) assert.ok(!all.includes(name.split(' ')[1]), 'nessun cognome negli eventi');
    await p.close();
  });

  await step('analytics su localhost: usa gli script di debug (non inviano dati)', async () => {
    const { p, hits } = await servePage('http://localhost:8080');
    assert.deepStrictEqual(hits.sort(), [
      'https://va.vercel-scripts.com/v1/script.debug.js',
      'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js',
    ]);
    await p.close();
  });

  await step('telefono: nessuno scroll orizzontale', async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await m.goto(PAGE_URL);
    assert.strictEqual(await m.evaluate(() => document.documentElement.scrollWidth), 390);
    await m.close();
  });

  await step('nessun errore JavaScript', async () => assert.deepStrictEqual(errors, []));

  await browser.close();
  for (const [s, n] of results) console.log(`${s === 'ok' ? 'ok  ' : 'FAIL'} ${n}`);
  const failed = results.filter(([s]) => s !== 'ok').length;
  console.log(`\n${results.length - failed}/${results.length} passati`);
  process.exit(failed ? 1 : 0);
})();
