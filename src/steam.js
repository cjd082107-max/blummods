// Steam games are launched through Steam (steam://rungameid/<id>), never by opening the .exe.
// Opening the .exe makes many games start Steam themselves and quit; that Steam then inherits the mod
// loader's DOORSTOP_* settings, and every game it starts afterwards skips the mods.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// The Steam app id for a game .exe inside <library>\steamapps\common\<folder>\..., or '' if it isn't a Steam game.
function steamAppId(exe, { readdir = fs.readdirSync, readFile = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  const parts = String(exe || '').split(/[\\/]/);
  const i = parts.findIndex((p, n) => p.toLowerCase() === 'common' && (parts[n - 1] || '').toLowerCase() === 'steamapps');
  if (i < 1 || !parts[i + 1]) return '';
  const steamapps = parts.slice(0, i).join(path.sep);
  const folder = parts[i + 1].toLowerCase();
  let files = [];
  try { files = readdir(steamapps).filter((f) => /^appmanifest_\d+\.acf$/i.test(f)); } catch { return ''; }
  for (const f of files) {
    try {
      const txt = readFile(path.join(steamapps, f));
      const dir = /"installdir"\s+"([^"]+)"/i.exec(txt)?.[1];
      const id = /"appid"\s+"(\d+)"/i.exec(txt)?.[1] || /(\d+)/.exec(f)[1];
      if (dir && dir.toLowerCase() === folder) return id;
    } catch { /* unreadable manifest */ }
  }
  return '';
}

// Is a program with this exe name already running? (Windows only; false elsewhere or on error.)
function isRunning(exe) {
  if (process.platform !== 'win32') return Promise.resolve(false);
  const name = path.basename(String(exe || ''));
  return new Promise((done) => execFile('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH', '/FO', 'CSV'], { windowsHide: true }, (err, out) =>
    done(!err && String(out).toLowerCase().includes(`"${name.toLowerCase()}"`))));
}

// True when the running Steam was opened by a game restarting itself (its command line is "steam.exe steam://run/<id>").
// Such a Steam carries the mod loader's settings and starts every game without mods until it is restarted.
function steamOpenedByGame() {
  if (process.platform !== 'win32') return Promise.resolve(false);
  const ps = "(Get-CimInstance Win32_Process -Filter \"Name='steam.exe'\" | Select-Object -ExpandProperty CommandLine) -join \"`n\"";
  return new Promise((done) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, out) =>
    done(!err && /steam:\/\/run\//i.test(String(out)))));
}

module.exports = { steamAppId, isRunning, steamOpenedByGame };
