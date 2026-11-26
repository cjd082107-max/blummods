// Dev only: launches BlumMods with sample data and saves screenshots of each screen.
const { app } = require('electron');
const fs = require('fs'); const path = require('path');
const tmp = path.join(require('os').tmpdir(), 'blum-shot'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
app.setPath('userData', tmp);
const icon = 'file://' + path.resolve(__dirname, '../build/icon.png');
fs.writeFileSync(path.join(tmp, 'blummods-data.json'), JSON.stringify({
  settings: { username: 'stizzplays', signApiKey: '', autoReconnect: true, dedupeFollows: true, port: 21777, keyGapMs: 60 },
  activeGameId: 'g1',
  games: [
    { id: 'g1', name: 'Lethal Company', exe: 'C:/Games/Lethal Company.exe', engine: 'Unity (Mono)', moddable: 'easy', bepinex: true, icon },
    { id: 'g2', name: 'Content Warning', exe: 'C:/Games/Content Warning.exe', engine: 'Unity (Mono)', moddable: 'easy', bepinex: false },
    { id: 'g3', name: 'Only Up', exe: 'C:/Games/OnlyUp.exe', engine: 'Unity (IL2CPP)', moddable: 'harder', bepinex: false },
  ],
  rules: [],
}));
const names = ['Rose','TikTok','GG','Ice Cream Cone','Heart Me','Finger Heart','Rosa','Perfume','Doughnut','Paper Crane','Hand Hearts','Confetti','Corgi','Money Gun','Galaxy','Blossom Fairy','Cactus Shuffle','Confetti Bear','DJ Set','Dreamy Hat','Health Potion','Jiggly Pudding','Magic Rhythm','Panda Snap','Lion','Universe'];
const costs = [1,1,1,1,1,5,10,20,30,99,100,100,299,500,1000,399,399,399,399,399,399,399,399,399,29999,44999];
fs.writeFileSync(path.join(tmp, 'gifts.json'), JSON.stringify(names.map((name, i) => ({ id: 5000 + i, name, diamond_count: costs[i], image: { url_list: [i % 5 === 4 ? 'file:///nope.png' : icon] } }))));
fs.writeFileSync(path.join(tmp, 'plugins.json'), JSON.stringify({ games: [{ ...JSON.parse(fs.readFileSync(path.join(__dirname, '../plugins/shred-a-billion/plugin.json'), 'utf8')), exe: ['Lethal Company.exe'] }] }));
require('../src/main.js');
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || '/tmp';
app.on('browser-window-created', (_e, win) => {
  win.webContents.on('did-finish-load', async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const js = (s) => win.webContents.executeJavaScript(s);
    const shot = async (n) => { await wait(500); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
    await wait(800);
    const WebSocket = require('ws'); const mod = new WebSocket('ws://127.0.0.1:21777/mods');
    mod.on('open', () => mod.send(JSON.stringify({ type: 'hello', game: 'Lethal Company' })));
    mod.on('message', (m) => console.log('MOD GOT', m.toString()));
    const game = new WebSocket('ws://127.0.0.1:21213/'); game.on('message', (m) => { const j = JSON.parse(m.toString()); console.log('FEED GOT', j.event, j.data.giftName || j.data.comment || j.data.likeCount || ''); });
    await shot('1-games');
    await js(`document.querySelector('[data-view=rules]').click(); document.getElementById('emptyStarter').click();`);
    await shot('2-rules');
    await js(`document.querySelector('[data-view=gifts]').click()`);
    await js(`document.querySelector('.gift[data-name="Galaxy"]').click()`);
    await shot('7-new-from-gift');
    await js(`document.querySelector('[data-sel=when]').click()`);
    await shot('8-when');
    await js(`document.getElementById('rSave').click(); document.querySelector('[data-view=rules]').click();`);
    await shot('2b-rules');
    await js(`document.querySelector('.rule2 [data-a=then]').click()`);
    await shot('3-edit');
    await js(`document.querySelector('#rCancel').click(); document.querySelector('[data-view=live]').click(); document.getElementById('tDelay').checked=false;
      document.getElementById('tGift').value='Galaxy'; document.getElementById('tGiftBtn').click();`);
    await shot('4-live');
    await js(`document.querySelector('[data-view=settings]').click()`);
    await shot('5-settings');
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'blummods-data.json'), 'utf8'));
    console.log('SAVED RULES', saved.rules.length);
    app.quit();
  });
});
