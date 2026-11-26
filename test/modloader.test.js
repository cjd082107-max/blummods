const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path'); const AdmZip = require('adm-zip');
const ml = require('../src/modloader');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blum-ml-')); const exe = path.join(tmp, 'Game.exe'); fs.writeFileSync(exe, 'x');
  const game = { exe, engine: 'Unity (IL2CPP)' };
  assert.equal(ml.status({ exe, engine: 'Other' }).state, 'unsupported');
  assert.equal(ml.status({ exe: 'C:/x/game.lnk', engine: 'Unity (Mono)' }).state, 'unsupported');
  assert.equal(ml.status(game).state, 'none');
  const z = new AdmZip(); z.addFile('BepInEx/core/BepInEx.Core.dll', Buffer.from('a')); z.addFile('winhttp.dll', Buffer.from('b')); z.addFile('doorstop_config.ini', Buffer.from('c')); const buf = z.toBuffer();
  let asked = ''; const fakeFetch = async (u) => { asked = u; return { ok: true, status: 200, headers: { get: () => String(buf.length) }, body: (async function* () { yield buf; })() }; };
  let pct = 0; const st = await ml.install(game, fakeFetch, (p) => (pct = p));
  assert.equal(st.state, 'installed'); assert.equal(pct, 100); assert.ok(asked.includes('IL2CPP-win-x64')); assert.ok(fs.existsSync(path.join(tmp, 'winhttp.dll')));
  fs.mkdirSync(path.join(tmp, 'BepInEx', 'interop')); fs.writeFileSync(path.join(tmp, 'BepInEx', 'interop', 'Game.Stream.dll'), 'x');
  assert.equal(ml.status(game).state, 'ready'); assert.equal(ml.status(game).plugin, false);
  fs.mkdirSync(path.join(tmp, 'BepInEx', 'plugins', 'BlumMods'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'BepInEx', 'plugins', 'BlumMods', 'BlumMods.dll'), 'x');
  assert.equal(ml.status(game).plugin, true);
  // a bad download installs nothing
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'blum-ml-')); const exe2 = path.join(tmp2, 'G.exe'); fs.writeFileSync(exe2, 'x');
  const bad = new AdmZip(); bad.addFile('readme.txt', Buffer.from('x')); const bb = bad.toBuffer();
  await assert.rejects(() => ml.install({ exe: exe2, engine: 'Unity (Mono)' }, async () => ({ ok: true, headers: { get: () => '0' }, body: (async function* () { yield bb; })() })), /looks wrong/);
  assert.deepEqual(fs.readdirSync(tmp2), ['G.exe']);
  assert.equal(ml.uninstall(game).state, 'none'); assert.ok(fs.existsSync(exe));
  console.log('all modloader tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
