// Collects the built game plugins into dist/plugins: each DLL plus plugins.json (what the app reads).
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const root = path.resolve(__dirname, '..'); const out = path.join(root, 'dist', 'plugins');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const games = [];
for (const dir of fs.readdirSync(path.join(root, 'plugins'), { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const metaFile = path.join(root, 'plugins', dir.name, 'plugin.json');
  if (!fs.existsSync(metaFile)) continue;
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  // IL2CPP plugins build for net6.0, Mono ones for netstandard2.1: take whichever folder has the DLL.
  const rel = path.join(root, 'plugins', dir.name, 'bin', 'Release');
  const fw = fs.existsSync(rel) ? fs.readdirSync(rel).find((f) => fs.existsSync(path.join(rel, f, meta.file))) : null;
  const dll = path.join(rel, fw || 'net6.0', meta.file);
  if (!fs.existsSync(dll)) throw new Error(`Missing build output: ${dll}`);
  const buf = fs.readFileSync(dll);
  fs.writeFileSync(path.join(out, meta.file), buf);
  games.push({ ...meta, sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length });
  console.log(meta.file, meta.version, buf.length, 'bytes');
}
fs.writeFileSync(path.join(out, 'plugins.json'), JSON.stringify({ games }, null, 2));
