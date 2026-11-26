const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os'); const AdmZip = require('adm-zip');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blum-e2e-')); const res = path.join(tmp, 'resources');
fs.mkdirSync(path.join(res, 'app', 'src'), { recursive: true });
fs.writeFileSync(path.join(res, 'app', 'package.json'), '{"version":"1.2.0","main":"src/main.js"}'); fs.writeFileSync(path.join(res, 'app', 'src', 'main.js'), '// old');
const zip = new AdmZip(); zip.addFile('package.json', Buffer.from('{"version":"1.3.0","main":"src/main.js"}')); zip.addFile('src/main.js', Buffer.from('// new')); const buf = zip.toBuffer();
const srv = http.createServer((q, r) => {
  if (q.url.endsWith('/releases/latest')) return r.end(JSON.stringify({ tag_name: 'v1.3.0', body: 'Gift pictures in alerts, faster loading', assets: [{ name: 'BlumMods-update.zip', size: buf.length, browser_download_url: `http://127.0.0.1:${srv.address().port}/dl` }] }));
  r.setHeader('content-length', buf.length); r.end(buf);
});
srv.listen(0, '127.0.0.1', () => {
  process.env.BLUM_UPDATE_API = `http://127.0.0.1:${srv.address().port}`; process.env.BLUM_UPDATE_RESOURCES = res;
  const { app } = require('electron'); app.setPath('userData', path.join(tmp, 'ud'));
  app.relaunch = () => console.log('RELAUNCH CALLED');
  const realExit = app.exit.bind(app);
  app.exit = () => { console.log('SWAPPED:', fs.readFileSync(path.join(res, 'app', 'src', 'main.js'), 'utf8'), '| old kept:', fs.existsSync(path.join(res, 'app-old'))); realExit(0); };
  require('../src/main.js');
  app.on('browser-window-created', (_e, win) => win.webContents.on('did-finish-load', async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(5500);
    fs.writeFileSync('/tmp/shots/9-update.png', (await win.webContents.capturePage()).toPNG());
    console.log('BANNER:', await win.webContents.executeJavaScript(`document.getElementById('updateBar').classList.contains('show') + ' ' + document.getElementById('upTitle').textContent`));
    await win.webContents.executeJavaScript(`document.getElementById('upGo').click()`);
  }));
});
