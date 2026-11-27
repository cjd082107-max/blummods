const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { steamLibraries, findExe, gamesToAdd } = require('../src/autoadd');

// A fake Steam install with two libraries.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blum-autoadd-'));
const steam = path.join(tmp, 'Steam'); const lib2 = path.join(tmp, 'Lib2');
const mk = (...p) => fs.mkdirSync(path.join(...p), { recursive: true });
const touch = (...p) => fs.writeFileSync(path.join(...p), '');
mk(steam, 'steamapps', 'common', 'Shred'); touch(steam, 'steamapps', 'common', 'Shred', 'ShredABillion.exe');
mk(lib2, 'steamapps', 'common', 'Megastore Tidy Up Together'); touch(lib2, 'steamapps', 'common', 'Megastore Tidy Up Together', 'Megastore Tidy Up Together.exe');
mk(lib2, 'steamapps', 'common', 'Nested', 'Bin'); touch(lib2, 'steamapps', 'common', 'Nested', 'Bin', 'Deep.exe');
fs.writeFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'),
  `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${steam.replace(/\\/g, '\\\\')}"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"${lib2.replace(/\\/g, '\\\\')}"\n\t}\n}\n`);

const libs = steamLibraries([steam, path.join(tmp, 'NoSteamHere')]);
assert.deepEqual(libs.map((l) => path.basename(l)).sort(), ['Lib2', 'Steam']);
assert.match(findExe(['megastore tidy up together.exe'], libs), /Megastore Tidy Up Together\.exe$/);
assert.match(findExe(['Deep.exe'], libs), /Bin[\\/]Deep\.exe$/);
assert.equal(findExe(['Missing.exe'], libs), null);

const manifest = [
  { id: 'shred', exe: ['ShredABillion.exe'] },
  { id: 'mega', exe: ['Megastore Tidy Up Together.exe'] },
  { id: 'gone', exe: ['NotInstalled.exe'] },
  { id: 'deep', exe: ['Deep.exe'] },
];
// Shred is already in his list; Deep was auto-added before and then removed by him, so it must stay removed.
const add = gamesToAdd(manifest, [{ exe: 'X:\\whatever\\ShredABillion.exe' }], ['deep.exe'], libs);
assert.deepEqual(add.map((a) => a.entry.id), ['mega']);
assert.deepEqual(gamesToAdd(manifest, [], [], []).length, 0); // no Steam found: nothing added, no crash

fs.rmSync(tmp, { recursive: true, force: true });
console.log('all autoadd tests passed');
