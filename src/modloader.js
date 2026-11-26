// Installs the BepInEx mod loader into a game's folder and reports how far setup has got.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

const PLUGINS_BASE = 'https://github.com/cjd082107-max/blummods/releases/download/plugins/';

const LOADERS = {
  il2cpp: { label: 'BepInEx 6 (be.793)', url: 'https://builds.bepinex.dev/projects/bepinex_be/793/BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.793%2Bdbc82f0.zip', sha256: '5b63d7d0e92a2448ccd13b738ff95ff1cc1026c6d718555d4df8e6c824953ac4' },
  mono: { label: 'BepInEx 5.4.23.2', url: 'https://github.com/BepInEx/BepInEx/releases/download/v5.4.23.2/BepInEx_win_x64_5.4.23.2.zip', size: 637157 },
};
const kindOf = (engine) => (/IL2CPP/i.test(engine || '') ? 'il2cpp' : /Mono/i.test(engine || '') ? 'mono' : null);
const hasFiles = (dir, re) => { try { return fs.readdirSync(dir).some((f) => re.test(f)); } catch { return false; } };

// Which entry of the plugin list (plugins.json) belongs to this game, matched by its .exe name.
function pluginFor(game, manifest) {
  const exe = path.basename(game.exe || '').toLowerCase();
  return ((manifest && Array.isArray(manifest.games) && manifest.games) || []).find((g) => (g.exe || []).some((e) => String(e).toLowerCase() === exe)) || null;
}
const pluginDir = (game) => path.join(path.dirname(game.exe), 'BepInEx', 'plugins', 'BlumMods');
function installedPluginVersion(game, entry) {
  try {
    if (!fs.existsSync(path.join(pluginDir(game), entry.file))) return '';
    return fs.readFileSync(path.join(pluginDir(game), entry.file + '.version'), 'utf8').trim() || '?';
  } catch { return '?'; }
}
async function installPlugin(game, entry, fetchFn) {
  const res = await fetchFn(PLUGINS_BASE + encodeURIComponent(entry.file));
  if (!res.ok) throw new Error(`Plugin download failed (${res.status})`);
  if (!/^[\w.-]+\.dll$/i.test(entry.file || '')) throw new Error('Plugin list entry looks wrong');
  const buf = Buffer.from(await res.arrayBuffer());
  if (!entry.sha256 || crypto.createHash('sha256').update(buf).digest('hex') !== entry.sha256) throw new Error('Plugin download was damaged');
  if (buf.length > 20 * 1024 * 1024) throw new Error('Plugin download is too large');
  fs.mkdirSync(pluginDir(game), { recursive: true });
  try { fs.writeFileSync(path.join(pluginDir(game), entry.file), buf); }
  catch (e) { throw new Error(/EPERM|EACCES|EBUSY/.test(e.code || '') ? 'the game is running, close it to update its plugin' : e.message); }
  fs.writeFileSync(path.join(pluginDir(game), entry.file + '.version'), entry.version);
}

// -> { kind, state: 'unsupported' | 'none' | 'installed' | 'ready', plugin: installed version or '', pluginLatest, hasActions }
function status(game, manifest) {
  const st = loaderStatus(game);
  const entry = st.state === 'unsupported' ? null : pluginFor(game, manifest);
  return { ...st, plugin: entry && st.state !== 'none' ? installedPluginVersion(game, entry) : '', pluginLatest: entry ? entry.version : '', hasActions: !!entry };
}
function loaderStatus(game) {
  const kind = kindOf(game.engine);
  if (!kind || !/\.exe$/i.test(game.exe || '')) return { kind, state: 'unsupported' };
  const dir = path.dirname(game.exe);
  const bep = path.join(dir, 'BepInEx');
  if (!fs.existsSync(path.join(bep, 'core'))) return { kind, state: 'none' };
  // "ready" = the game has been started once with the loader, so it has finished its own setup
  const ran = kind === 'il2cpp' ? hasFiles(path.join(bep, 'interop'), /\.dll$/i) : fs.existsSync(path.join(bep, 'LogOutput.log'));
  return { kind, state: ran ? 'ready' : 'installed' };
}

async function install(game, fetchFn, onProgress = () => {}, { skipPin = false } = {}) {
  const st = status(game);
  if (st.state === 'unsupported') throw new Error('This game is not a Unity game BlumMods can mod (or it was added as a shortcut instead of its .exe).');
  if (st.state !== 'none') return st;
  const dir = path.dirname(game.exe);
  const res = await fetchFn(LOADERS[st.kind].url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = []; let got = 0;
  for await (const c of res.body) { chunks.push(Buffer.from(c)); got += c.length; if (total) onProgress(Math.min(99, Math.round((got / total) * 100))); }
  const buf = Buffer.concat(chunks);
  const want = skipPin ? {} : LOADERS[st.kind];
  if (want.sha256 && crypto.createHash('sha256').update(buf).digest('hex') !== want.sha256) throw new Error('The downloaded mod loader does not match the expected file, nothing was installed');
  if (want.size && buf.length !== want.size) throw new Error('The downloaded mod loader is not the expected size, nothing was installed');
  const zip = new AdmZip(buf);
  for (const e of zip.getEntries()) { // nothing in the zip may land outside the game folder
    const dest = path.resolve(dir, e.entryName);
    if (dest !== dir && !dest.startsWith(dir + path.sep)) throw new Error('The downloaded mod loader looks wrong, nothing was installed');
  }
  const names = zip.getEntries().map((e) => e.entryName);
  if (!names.some((n) => /^BepInEx\/core\//.test(n)) || !names.includes('winhttp.dll')) throw new Error('The downloaded mod loader looks wrong, nothing was installed');
  try { zip.extractAllTo(dir, false); }
  catch (e) { throw new Error(/EPERM|EACCES|EBUSY/.test(e.code || '') ? 'Could not write to the game folder. Close the game and try again.' : e.message); }
  onProgress(100);
  return status(game);
}

function uninstall(game) {
  const dir = path.dirname(game.exe);
  for (const f of ['BepInEx', 'dotnet', 'winhttp.dll', 'doorstop_config.ini', '.doorstop_version', 'changelog.txt']) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  return status(game);
}

module.exports = { status, install, uninstall, pluginFor, installPlugin, installedPluginVersion, LOADERS, kindOf, PLUGINS_BASE };
