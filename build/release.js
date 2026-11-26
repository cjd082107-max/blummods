// Builds a release: the full Windows zip (first install) and the small update zip the app downloads.
// Publish with:  gh release create v<version> dist/release/* --repo <owner>/<repo> --title "v<version>" --notes "<what's new>"
const { execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path'); const AdmZip = require('adm-zip');
const root = path.resolve(__dirname, '..'); const v = require(path.join(root, 'package.json')).version;
execFileSync('node', [path.join(__dirname, 'pack.js')], { stdio: 'inherit' });
const out = path.join(root, 'dist', 'release'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const built = path.join(root, 'dist', 'BlumMods-win32-x64');
fs.copyFileSync(path.join(root, 'README.md'), path.join(built, 'READ ME FIRST.md'));
const upd = new AdmZip(); upd.addLocalFolder(path.join(built, 'resources', 'app')); upd.writeZip(path.join(out, 'BlumMods-update.zip'));
const stage = path.join(root, 'dist', 'BlumMods'); fs.rmSync(stage, { recursive: true, force: true }); fs.renameSync(built, stage);
execFileSync('zip', ['-qr', '-9', path.join(out, `BlumMods-Windows-v${v}.zip`), 'BlumMods'], { cwd: path.join(root, 'dist') });
fs.renameSync(stage, built);
for (const f of fs.readdirSync(out)) console.log(f, (fs.statSync(path.join(out, f)).size / 1e6).toFixed(1) + ' MB');
