// Steam games are found by their appmanifest so they can be launched through Steam.
const assert = require('assert');
const path = require('path');
const { steamAppId, isRunning } = require('../src/steam');
const lib = path.join('E:', 'SteamLibrary', 'steamapps');
const files = {
  'appmanifest_5472080.acf': '"AppState"\n{\n\t"appid"\t\t"5472080"\n\t"installdir"\t\t"SHRED A BILLION"\n}',
  'appmanifest_5027520.acf': '"AppState"\n{\n\t"appid"\t\t"5027520"\n\t"installdir"\t\t"Megastore Tidy Up Together"\n}',
};
const fake = { readdir: (d) => { assert.strictEqual(d, lib); return Object.keys(files).concat(['libraryfolder.vdf']); }, readFile: (f) => files[path.basename(f)] };
assert.strictEqual(steamAppId(path.join(lib, 'common', 'SHRED A BILLION', 'ShredABillion.exe'), fake), '5472080');
assert.strictEqual(steamAppId(path.join(lib, 'common', 'shred a billion', 'Sub', 'x.exe'), fake), '5472080');
assert.strictEqual(steamAppId(path.join(lib, 'common', 'Megastore Tidy Up Together', 'Megastore Tidy Up Together.exe'), fake), '5027520');
assert.strictEqual(steamAppId(path.join(lib, 'common', 'SHRED A BILLION Demo', 'ShredABillion.exe'), fake), '');
assert.strictEqual(steamAppId(path.join('C:', 'Games', 'Thing', 'thing.exe'), fake), '');
isRunning('definitely-not-running-blum.exe').then((r) => { assert.strictEqual(r, false); console.log('steam: all passed'); });
