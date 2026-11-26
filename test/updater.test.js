// Runs the whole update flow against a fake GitHub on localhost and a temp "resources" folder.
const assert = require('assert'); const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');
const AdmZip = require('adm-zip'); const { Updater, cmpVer } = require('../src/updater');
(async () => {
  assert.equal(cmpVer('1.10.0', '1.9.9'), 1); assert.equal(cmpVer('v1.2.0', '1.2.0'), 0); assert.equal(cmpVer('1.1.9', '1.2'), -1);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blum-upd-')); const res = path.join(tmp, 'resources');
  fs.mkdirSync(path.join(res, 'app', 'src'), { recursive: true });
  fs.writeFileSync(path.join(res, 'app', 'package.json'), JSON.stringify({ version: '1.0.0', main: 'src/main.js' }));
  fs.writeFileSync(path.join(res, 'app', 'src', 'main.js'), '// old');
  const zip = new AdmZip(); zip.addFile('package.json', Buffer.from(JSON.stringify({ version: '1.5.0', main: 'src/main.js' }))); zip.addFile('src/main.js', Buffer.from('// new'));
  const buf = zip.toBuffer(); let digest = 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'); let tag = 'v1.5.0';
  const srv = http.createServer((q, r) => {
    if (q.url.endsWith('/releases/latest')) return r.end(JSON.stringify({ tag_name: tag, body: 'New stuff', assets: [{ name: 'BlumMods-update.zip', size: buf.length, digest, browser_download_url: `http://127.0.0.1:${srv.address().port}/dl` }] }));
    r.setHeader('content-length', buf.length); r.end(buf);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const mk = (v) => new Updater({ repo: 'a/b', currentVersion: v, resourcesDir: res, workDir: path.join(tmp, 'work'), apiBase: `http://127.0.0.1:${srv.address().port}` });
  assert.equal(await mk('1.5.0').check(), null);
  assert.equal(await mk('2.0.0').check(), null);
  const u = mk('1.0.0'); const info = await u.check(); assert.equal(info.version, '1.5.0'); assert.equal(info.notes, 'New stuff');
  let pct = 0; const file = await u.download(info, (p) => (pct = p)); assert.ok(pct > 0);
  u.stage(file, info); u.apply();
  assert.equal(fs.readFileSync(path.join(res, 'app', 'src', 'main.js'), 'utf8'), '// new');
  assert.equal(fs.readFileSync(path.join(res, 'app-old', 'src', 'main.js'), 'utf8'), '// old');
  u.cleanup(); assert.ok(!fs.existsSync(path.join(res, 'app-old')));
  // damaged download is rejected
  tag = 'v1.6.0'; digest = 'sha256:' + '0'.repeat(64);
  const u2 = mk('1.5.0'); await assert.rejects(async () => u2.download(await u2.check()), /damaged/);
  // wrong version inside the zip is rejected and the app is left alone
  digest = ''; const u3 = mk('1.5.0'); const i3 = await u3.check(); const f3 = await u3.download(i3); assert.throws(() => u3.stage(f3, i3), /looks wrong/);
  assert.equal(fs.readFileSync(path.join(res, 'app', 'src', 'main.js'), 'utf8'), '// new');
  srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log('all updater tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
