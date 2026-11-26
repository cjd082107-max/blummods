// BlumMods self-updater. Checks a GitHub repo's latest release, downloads the small
// "BlumMods-update.zip" asset (the app's code folder), and swaps it in on restart.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

function cmpVer(a, b) {
  const p = (v) => String(v).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  return 0;
}

class Updater {
  constructor({ repo, currentVersion, resourcesDir, workDir, apiBase = 'https://api.github.com', assetName = 'BlumMods-update.zip' }) {
    Object.assign(this, { repo, currentVersion, resourcesDir, workDir, apiBase, assetName });
    this.appDir = path.join(resourcesDir, 'app');
    this.newDir = path.join(resourcesDir, 'app-new');
    this.oldDir = path.join(resourcesDir, 'app-old');
  }

  // -> null when up to date, else { version, notes, url, size, sha256 }
  async check() {
    const res = await fetch(`${this.apiBase}/repos/${this.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BlumMods' } });
    if (res.status === 404) return null; // no releases yet
    if (!res.ok) throw new Error(`Update check failed (${res.status})`);
    const rel = await res.json();
    const version = String(rel.tag_name || '').replace(/^v/i, '');
    if (!version || cmpVer(version, this.currentVersion) <= 0) return null;
    const asset = (rel.assets || []).find((a) => a.name === this.assetName);
    if (!asset) return null;
    return {
      version, notes: String(rel.body || '').trim(), url: asset.browser_download_url, size: asset.size || 0,
      sha256: /^sha256:/.test(asset.digest || '') ? asset.digest.slice(7) : '',
    };
  }

  async download(info, onProgress = () => {}) {
    fs.mkdirSync(this.workDir, { recursive: true });
    const file = path.join(this.workDir, `update-${info.version}.zip`);
    const res = await fetch(info.url, { headers: { 'User-Agent': 'BlumMods', Accept: 'application/octet-stream' } });
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
    const total = Number(res.headers.get('content-length')) || info.size || 0;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
    let got = 0;
    for await (const chunk of res.body) {
      hash.update(chunk); got += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      if (total) onProgress(Math.min(99, Math.round((got / total) * 100)));
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    if (info.sha256 && hash.digest('hex') !== info.sha256.toLowerCase()) { fs.rmSync(file, { force: true }); throw new Error('Downloaded update was damaged — try again'); }
    return file;
  }

  // Unpack next to the running app and make sure it really is the promised version.
  stage(zipFile, info) {
    fs.rmSync(this.newDir, { recursive: true, force: true });
    new AdmZip(zipFile).extractAllTo(this.newDir, true);
    const pkg = JSON.parse(fs.readFileSync(path.join(this.newDir, 'package.json'), 'utf8'));
    if (pkg.version !== info.version || !fs.existsSync(path.join(this.newDir, pkg.main || 'index.js'))) {
      fs.rmSync(this.newDir, { recursive: true, force: true });
      throw new Error('Update package looks wrong');
    }
    fs.rmSync(zipFile, { force: true });
  }

  // Swap folders. The old one is kept as app-old until the next successful start.
  apply() {
    fs.rmSync(this.oldDir, { recursive: true, force: true });
    fs.renameSync(this.appDir, this.oldDir);
    try { fs.renameSync(this.newDir, this.appDir); }
    catch (e) { fs.renameSync(this.oldDir, this.appDir); throw e; }
  }

  cleanup() { try { fs.rmSync(this.oldDir, { recursive: true, force: true }); } catch { /* next time */ } }
}

module.exports = { Updater, cmpVer };
