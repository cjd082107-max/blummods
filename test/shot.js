// Dev only: launches BlumMods with sample data and saves screenshots of each screen.
// Run: electron test/shot.js --out=<folder>. Uses a throwaway data folder and never touches real game folders.
const { app } = require('electron');
const fs = require('fs'); const path = require('path');
process.env.BLUM_NO_SYNC = '1';
const tmp = path.join(require('os').tmpdir(), 'blum-shot'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
app.setPath('userData', tmp);
const icon = 'file://' + path.resolve(__dirname, '../build/icon.png');
fs.writeFileSync(path.join(tmp, 'blummods-data.json'), JSON.stringify({
  settings: { username: 'stiz', signApiKey: '', autoReconnect: true, dedupeFollows: true, port: 21777, keyGapMs: 60 },
  activeGameId: 'g1',
  games: [
    { id: 'g1', name: 'Megastore: Tidy Up Together', exe: 'C:/Games/Megastore Tidy Up Together.exe', engine: 'Unity (Mono)', moddable: 'easy', icon },
    { id: 'g2', name: 'SHRED A BILLION', exe: 'C:/Games/ShredABillion.exe', engine: 'Unity (IL2CPP)', moddable: 'harder' },
    { id: 'g3', name: 'Geometry Dash', exe: 'C:/Games/GeometryDash.exe', engine: 'Other', moddable: 'keys only' },
  ],
  rules: [],
}));
const names = ['Rose','TikTok','GG','Ice Cream Cone','Heart Me','Finger Heart','Rosa','Perfume','Doughnut','Paper Crane','Hand Hearts','Confetti','Corgi','Money Gun','Galaxy','Lion','Universe'];
const costs = [1,1,1,1,1,5,10,20,30,99,100,100,299,500,1000,29999,44999];
fs.writeFileSync(path.join(tmp, 'gifts.json'), JSON.stringify(names.map((name, i) => ({ id: 5000 + i, name, diamond_count: costs[i], image: { url_list: [icon] } }))));
const plug = (dir) => JSON.parse(fs.readFileSync(path.join(__dirname, '../plugins', dir, 'plugin.json'), 'utf8'));
fs.writeFileSync(path.join(tmp, 'plugins.json'), JSON.stringify({ games: [{ ...plug('megastore-tidy-up'), sha256: 'a'.repeat(64) }, { ...plug('shred-a-billion'), sha256: 'b'.repeat(64) }] }));
require('../src/main.js');
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || require('os').tmpdir();
app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (_ev, level, msg) => { if (level >= 2) console.log('PAGE ERROR:', msg); });
  win.webContents.on('did-finish-load', async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const js = (s) => win.webContents.executeJavaScript(s);
    const shot = async (n) => { await wait(450); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
    const check = async (label, expr) => console.log((await js(expr)) ? 'OK  ' : 'FAIL', label);
    await wait(900);
    await shot('01-games');
    await check('no Gifts or Triggers in the menu', `!document.querySelector('[data-view=gifts],[data-view=rules]')`);
    await js(`document.querySelector('.game [data-a=rules]').click()`);
    await shot('02-panel-empty');
    await check('panel opened for Megastore', `!document.getElementById('gamePanel').classList.contains('hidden') && document.querySelector('.gp-name').textContent.includes('Megastore')`);
    await js(`document.getElementById('gpEmptyNew').click()`);
    await shot('03-new-trigger');
    await check('editor lists only game events (no keys, alerts, waits, mod commands)', `[...document.querySelectorAll('.ev-item b')].every(b => !/Press a key|Show an alert|Wait|Custom mod/.test(b.textContent)) && document.querySelectorAll('.ev-item').length >= 10`);
    await js(`document.querySelector('[data-sel=when]').click()`);
    await shot('04-when');
    await check('no "Works in" picker', `!document.getElementById('rScope')`);
    await js(`document.getElementById('rSave').click()`);
    await shot('05-panel-one-trigger');
    await check('trigger shows in the panel', `document.querySelectorAll('#gpRules .rule2').length === 1`);
    await js(`document.getElementById('gpClose').click(); document.querySelectorAll('.game [data-a=rules]')[2].click()`);
    await shot('06-panel-no-mod');
    await js(`document.getElementById('gpClose').click(); document.querySelector('[data-view=keys]').click()`);
    await shot('07-keys-empty');
    await js(`document.getElementById('addKeyBtn').click()`);
    await shot('08-key-editor');
    await check('key editor offers key + wait only', `[...document.querySelectorAll('.ev-item b')].map(b => b.textContent).join('|') === 'Press a key|Wait'`);
    await js(`document.getElementById('rSave').click()`);
    await shot('09-keys-one');
    await js(`document.getElementById('keysOn').click()`);
    await shot('10-keys-off');
    await js(`document.querySelector('[data-view=live]').click()`);
    await shot('11-live');
    await js(`document.querySelector('[data-view=settings]').click()`);
    await shot('12-settings');
    await wait(400);
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'blummods-data.json'), 'utf8'));
    console.log('SAVED RULES', saved.rules.map((r) => `${r.name} [${r.gameId || 'keys'}]`).join(' ; '), '| keysOn =', saved.settings.keysOn);
    app.quit();
  });
});
