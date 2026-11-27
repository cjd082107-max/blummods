// Finds games that have a BlumMods plugin and are installed in Steam, so the app can add them by itself.
const fs = require('fs');
const path = require('path');

const STEAM_DEFAULTS = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];

// Every Steam library folder on this PC, read from Steam's own libraryfolders.vdf.
function steamLibraries(steamRoots = STEAM_DEFAULTS) {
  const libs = new Set();
  for (const root of steamRoots) {
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
    let text = '';
    try { text = fs.readFileSync(vdf, 'utf8'); } catch { continue; }
    libs.add(path.normalize(root));
    for (const m of text.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/g)) libs.add(path.normalize(m[1].replace(/\\\\/g, '\\')));
  }
  return [...libs];
}

// Looks for an exe by file name in each library's steamapps\common\<game>\ (and one folder deeper).
function findExe(exeNames, libraries) {
  const wanted = new Set(exeNames.map((e) => String(e).toLowerCase()));
  for (const lib of libraries) {
    const common = path.join(lib, 'steamapps', 'common');
    let gameDirs = [];
    try { gameDirs = fs.readdirSync(common, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { continue; }
    for (const d of gameDirs) {
      const dir = path.join(common, d.name);
      const hit = scan(dir, wanted) || subdirs(dir).map((s) => scan(s, wanted)).find(Boolean);
      if (hit) return hit;
    }
  }
  return null;
}
const scan = (dir, wanted) => { try { const f = fs.readdirSync(dir).find((n) => wanted.has(n.toLowerCase())); return f ? path.join(dir, f) : null; } catch { return null; } };
const subdirs = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(dir, d.name)); } catch { return []; } };

// Which plugin games should be added now: installed, not already in the list, and not added (then removed) before.
function gamesToAdd(manifestGames, haveGames, alreadyAutoAdded, libraries) {
  const have = new Set(haveGames.map((g) => path.basename(g.exe || '').toLowerCase()));
  const done = new Set(alreadyAutoAdded.map((e) => String(e).toLowerCase()));
  const out = [];
  for (const entry of manifestGames) {
    const names = (entry.exe || []).map((e) => String(e).toLowerCase());
    if (!names.length || names.some((n) => have.has(n) || done.has(n))) continue;
    const exe = findExe(names, libraries);
    if (exe) out.push({ entry, exe });
  }
  return out;
}

module.exports = { steamLibraries, findExe, gamesToAdd };
