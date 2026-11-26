// Packages BlumMods for Windows x64 and stamps the icon + version info into the .exe (no Wine needed).
const { packager } = require('@electron/packager');
const ResEdit = require('resedit');
const fs = require('fs'); const path = require('path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const [out] = await packager({
    dir: root, out: path.join(root, 'dist'), name: 'BlumMods', executableName: 'BlumMods',
    platform: 'win32', arch: 'x64', overwrite: true, asar: false, prune: true,
    ignore: [/^\/dist($|\/)/, /^\/test($|\/)/, /^\/build\/pack\.js$/, /^\/README\.md$/, /^\/mod-template($|\/)/],
    appCopyright: 'Carter', win32metadata: { CompanyName: 'BlumMods', ProductName: 'BlumMods', FileDescription: 'BlumMods' },
  });
  const exePath = path.join(out, 'BlumMods.exe');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const ids = groups.map((g) => g.id); const lang = groups[0]?.lang ?? 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, ids[0] ?? 1, lang, ico.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const v = require(path.join(root, 'package.json')).version.split('.').map(Number);
    vi.setFileVersion(v[0], v[1], v[2], 0); vi.setProductVersion(v[0], v[1], v[2], 0);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'BlumMods', FileDescription: 'BlumMods', CompanyName: 'BlumMods', OriginalFilename: 'BlumMods.exe' });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('Packaged:', out);
})().catch((e) => { console.error(e); process.exit(1); });
