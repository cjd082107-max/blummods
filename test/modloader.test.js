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
  let pct = 0; const st = await ml.install(game, fakeFetch, (p) => (pct = p), { skipPin: true });
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'blum-ml-')); fs.writeFileSync(path.join(tmp3, 'G.exe'), 'x');
  await assert.rejects(() => ml.install({ exe: path.join(tmp3, 'G.exe'), engine: 'Unity (IL2CPP)' }, fakeFetch), /does not match/); // the real pin rejects a different file
  assert.deepEqual(fs.readdirSync(tmp3), ['G.exe']);
  assert.equal(st.state, 'installed'); assert.equal(pct, 100); assert.ok(asked.includes('IL2CPP-win-x64')); assert.ok(fs.existsSync(path.join(tmp, 'winhttp.dll')));
  fs.mkdirSync(path.join(tmp, 'BepInEx', 'interop')); fs.writeFileSync(path.join(tmp, 'BepInEx', 'interop', 'Game.Stream.dll'), 'x');
  assert.equal(ml.status(game).state, 'ready'); assert.equal(ml.status(game).plugin, '');
  const dll = Buffer.from('fake dll'); const sha = require('crypto').createHash('sha256').update(dll).digest('hex');
  const manifest = { games: [{ id: 'g', exe: ['game.EXE'], file: 'BlumMods.G.dll', version: '0.2.0', sha256: sha, actions: [{ id: 'jail' }] }] };
  assert.equal(ml.pluginFor({ exe: 'C:/x/other.exe' }, manifest), null);
  const entry = ml.pluginFor(game, manifest); assert.equal(entry.id, 'g');
  assert.deepEqual([ml.status(game, manifest).plugin, ml.status(game, manifest).pluginLatest, ml.status(game, manifest).hasActions], ['', '0.2.0', true]);
  const dlFetch = async () => ({ ok: true, arrayBuffer: async () => dll.buffer.slice(dll.byteOffset, dll.byteOffset + dll.length) });
  await ml.installPlugin(game, entry, dlFetch);
  assert.equal(ml.status(game, manifest).plugin, '0.2.0');
  await assert.rejects(() => ml.installPlugin(game, { ...entry, sha256: '00' }, dlFetch), /damaged/);
  // a bad download installs nothing
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'blum-ml-')); const exe2 = path.join(tmp2, 'G.exe'); fs.writeFileSync(exe2, 'x');
  const bad = new AdmZip(); bad.addFile('readme.txt', Buffer.from('x')); const bb = bad.toBuffer();
  await assert.rejects(() => ml.install({ exe: exe2, engine: 'Unity (Mono)' }, async () => ({ ok: true, headers: { get: () => '0' }, body: (async function* () { yield bb; })() }), () => {}, { skipPin: true }), /looks wrong/);
  assert.deepEqual(fs.readdirSync(tmp2), ['G.exe']);
  assert.equal(ml.uninstall(game).state, 'none'); assert.ok(fs.existsSync(exe));
  console.log('all modloader tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
