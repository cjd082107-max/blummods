// Installs the BepInEx mod loader into a game's folder and reports how far setup has got.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const LOADERS = {
  il2cpp: { label: 'BepInEx 6 (be.793)', url: 'https://builds.bepinex.dev/projects/bepinex_be/793/BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.793%2Bdbc82f0.zip' },
  mono: { label: 'BepInEx 5.4.23.2', url: 'https://github.com/BepInEx/BepInEx/releases/download/v5.4.23.2/BepInEx_win_x64_5.4.23.2.zip' },
};
const kindOf = (engine) => (/IL2CPP/i.test(engine || '') ? 'il2cpp' : /Mono/i.test(engine || '') ? 'mono' : null);
const hasFiles = (dir, re) => { try { return fs.readdirSync(dir).some((f) => re.test(f)); } catch { return false; } };

// -> { kind, state: 'unsupported' | 'none' | 'installed' | 'ready', plugin: bool }
function status(game) {
  const kind = kindOf(game.engine);
  if (!kind || !/\.exe$/i.test(game.exe || '')) return { kind, state: 'unsupported', plugin: false };
  const dir = path.dirname(game.exe);
  const bep = path.join(dir, 'BepInEx');
  if (!fs.existsSync(path.join(bep, 'core'))) return { kind, state: 'none', plugin: false };
  // "ready" = the game has been started once with the loader, so it has finished its own setup
  const ran = kind === 'il2cpp' ? hasFiles(path.join(bep, 'interop'), /\.dll$/i) : fs.existsSync(path.join(bep, 'LogOutput.log'));
  return { kind, state: ran ? 'ready' : 'installed', plugin: hasFiles(path.join(bep, 'plugins', 'BlumMods'), /\.dll$/i) };
}

async function install(game, fetchFn, onProgress = () => {}) {
  const st = status(game);
  if (st.state === 'unsupported') throw new Error('This game is not a Unity game BlumMods can mod (or it was added as a shortcut instead of its .exe).');
  if (st.state !== 'none') return st;
  const dir = path.dirname(game.exe);
  const res = await fetchFn(LOADERS[st.kind].url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = []; let got = 0;
  for await (const c of res.body) { chunks.push(Buffer.from(c)); got += c.length; if (total) onProgress(Math.min(99, Math.round((got / total) * 100))); }
  const zip = new AdmZip(Buffer.concat(chunks));
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

module.exports = { status, install, uninstall, LOADERS, kindOf };
