const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { WebSocketServer } = require('ws');
const { RuleEngine, fillTemplate } = require('./rules');
const { KeySender, KEY_CHOICES } = require('./keys');
const { Updater } = require('./updater');

app.setName('BlumMods');
if (process.platform === 'win32') app.setAppUserModelId('com.blummods.app');
if (!app.requestSingleInstanceLock()) app.quit();

// ---------- storage ----------
const DATA_FILE = () => path.join(app.getPath('userData'), 'blummods-data.json');
const DEFAULT_DATA = {
  settings: { username: '', signApiKey: '', autoReconnect: true, dedupeFollows: true, port: 21777, keyGapMs: 60 },
  activeGameId: null,
  games: [],
  rules: [],
};
let data = structuredClone(DEFAULT_DATA);
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'));
    data = { ...DEFAULT_DATA, ...d, settings: { ...DEFAULT_DATA.settings, ...(d.settings || {}) } };
  } catch { /* first run */ }
}
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE()), { recursive: true });
  const tmp = DATA_FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE());
}

// ---------- gift catalog (pulled from TikTok, cached so it works offline) ----------
const GIFTS_FILE = () => path.join(app.getPath('userData'), 'gifts.json');
let giftCatalog = [];
function normalizeGifts(list) {
  const seen = new Set(); const out = [];
  for (const g of Array.isArray(list) ? list : []) {
    const name = String(g?.name || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({
      id: g.id, name, diamonds: Number(g.diamond_count ?? g.diamonds ?? 0) || 0,
      image: g.image?.url_list?.[0] || g.icon?.url_list?.[0] || g.image?.url?.[0] || (typeof g.image === 'string' ? g.image : '') || '',
    });
  }
  return out;
}
function loadGifts() { try { giftCatalog = normalizeGifts(JSON.parse(fs.readFileSync(GIFTS_FILE(), 'utf8'))); } catch { giftCatalog = []; } }
function setGifts(list) {
  const next = normalizeGifts(list);
  if (!next.length) return 0;
  giftCatalog = next;
  try { fs.writeFileSync(GIFTS_FILE(), JSON.stringify(giftCatalog)); } catch { /* cache is optional */ }
  send('gift-list', giftCatalog);
  return giftCatalog.length;
}

// ---------- window ----------
let win;
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };
const log = (msg, level = 'info') => send('log', { msg, level, t: Date.now() });

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 640,
    backgroundColor: '#0b0b12',
    title: 'BlumMods',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0b12', symbolColor: '#c9c9d6', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ---------- local server: game mods + stream overlay ----------
let server, modWss, overlayWss;
const mods = new Map(); // ws -> { game }
function modsStatus() { send('mods', [...mods.values()]); }
function startServer() {
  const port = Number(data.settings.port) || 21777;
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/overlay')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(__dirname, 'overlay.html')));
    } else { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('BlumMods is running'); }
  });
  modWss = new WebSocketServer({ noServer: true });
  overlayWss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, sock, head) => {
    const target = req.url.startsWith('/overlay') ? overlayWss : req.url.startsWith('/mods') || req.url === '/' ? modWss : null;
    if (!target) return sock.destroy();
    target.handleUpgrade(req, sock, head, (ws) => target.emit('connection', ws, req));
  });
  modWss.on('connection', (ws) => {
    mods.set(ws, { game: 'Unknown mod' });
    modsStatus();
    ws.on('message', (m) => {
      try {
        const msg = JSON.parse(m.toString());
        if (msg.type === 'hello') { mods.set(ws, { game: String(msg.game || 'Mod') }); modsStatus(); log(`Mod connected: ${msg.game}`, 'good'); }
        else if (msg.type === 'log') log(`[${mods.get(ws)?.game}] ${msg.text}`);
      } catch { /* ignore */ }
    });
    ws.on('close', () => { mods.delete(ws); modsStatus(); });
  });
  server.on('error', (e) => log(`Mod server error on port ${port}: ${e.message}`, 'bad'));
  server.listen(port, '127.0.0.1', () => log(`Mod server ready on ws://127.0.0.1:${port}/mods`));
}
function broadcast(wss, obj) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}

// ---------- actions ----------
let keys;
const engine = new RuleEngine();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const queue = [];
let running = false;
const stats = { gifts: 0, diamonds: 0, follows: 0, likes: 0, shares: 0, fired: 0 };

async function runAction(a, ev) {
  switch (a.kind) {
    case 'key': {
      const n = Math.max(1, Math.min(50, Number(a.repeat) || 1));
      for (let i = 0; i < n; i++) {
        await keys.press(a.key, Number(a.holdMs) || 80);
        await sleep(Number(data.settings.keyGapMs) || 60);
      }
      break;
    }
    case 'mod':
      broadcast(modWss, {
        type: 'command', command: fillTemplate(a.command, ev), args: fillTemplate(a.args || '', ev),
        event: ev.type, user: ev.user?.uniqueId || '', nickname: ev.user?.nickname || '',
        gift: ev.gift?.name || '', count: ev.gift?.count || 1, diamonds: ev.gift?.diamonds || 0, comment: ev.comment || '',
      });
      if (!mods.size) log(`Mod command "${a.command}" sent, but no game mod is connected`, 'warn');
      break;
    case 'sound':
      if (a.file) send('play-sound', { url: pathToFileURL(a.file).href, volume: (Number(a.volume) || 80) / 100 });
      break;
    case 'alert': {
      const alert = { text: fillTemplate(a.text || '{nickname}', ev), color: a.color || '#25f4ee', seconds: Number(a.seconds) || 4 };
      send('alert', alert);
      broadcast(overlayWss, { type: 'alert', ...alert });
      break;
    }
    case 'wait':
      await sleep(Math.min(60000, Number(a.ms) || 500));
      break;
  }
}
async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    send('queue', queue.length);
    try { for (const a of job.actions) await runAction(a, job.ev); }
    catch (e) { log(`Action failed (${job.name}): ${e.message}`, 'bad'); }
  }
  running = false;
  send('queue', 0);
}
function enqueue(name, actions, ev) {
  if (queue.length > 200) { log('Action queue is full — skipping', 'warn'); return; }
  queue.push({ name, actions, ev });
  send('queue', queue.length);
  pump();
}
function activeRules() {
  return data.rules.filter((r) => r.enabled && (!r.gameId || r.gameId === data.activeGameId));
}

function handleEvent(ev) {
  if (ev.type === 'gift') { stats.gifts += ev.gift.count; stats.diamonds += ev.gift.diamonds * ev.gift.count; }
  if (ev.type === 'follow') stats.follows++;
  if (ev.type === 'share') stats.shares++;
  const fired = engine.match(ev, activeRules(), { dedupeFollows: data.settings.dedupeFollows });
  if (ev.type === 'like') stats.likes = engine.likeTotal;
  for (const f of fired) {
    stats.fired += f.times;
    for (let i = 0; i < f.times; i++) enqueue(f.rule.name, f.rule.actions || [], f.ev);
  }
  send('event', { ev, fired: fired.map((f) => ({ name: f.rule.name, times: f.times })) });
  send('stats', stats);
}

// ---------- TikTok ----------
let tt = null; // { connection }
let wantConnected = false;
let reconnectTimer = null;
let status = { state: 'offline', text: 'Not connected' };
const setStatus = (state, text) => { status = { state, text }; send('status', status); };
const userOf = (u) => ({
  uniqueId: u?.uniqueId || '', nickname: u?.nickname || u?.uniqueId || '',
  avatar: u?.profilePicture?.url?.[0] || '',
});

async function connectTikTok() {
  const username = String(data.settings.username || '').trim().replace(/^@/, '');
  if (!username) { setStatus('offline', 'Enter your TikTok username first'); return; }
  wantConnected = true;
  clearTimeout(reconnectTimer);
  if (tt) { try { await tt.disconnect(); } catch {} tt = null; }
  setStatus('connecting', `Connecting to @${username}…`);
  let lib;
  try { lib = await import('tiktok-live-connector'); }
  catch (e) { setStatus('error', 'TikTok library failed to load: ' + e.message); return; }
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
  const opts = { enableExtendedGiftInfo: true };
  if (data.settings.signApiKey) opts.signApiKey = data.settings.signApiKey;
  const c = new TikTokLiveConnection(username, opts);
  tt = c;

  c.on(WebcastEvent.GIFT, (d) => {
    const g = d.giftDetails || {};
    if (g.giftType === 1 && !d.repeatEnd) return; // streak still going; wait for the end
    handleEvent({
      type: 'gift', user: userOf(d.user),
      gift: {
        id: d.giftId, name: g.giftName || d.extendedGiftInfo?.name || `Gift ${d.giftId}`,
        diamonds: g.diamondCount || d.extendedGiftInfo?.diamond_count || 0,
        count: d.repeatCount || 1, image: g.giftImage?.url?.[0] || giftCatalog.find((x) => String(x.id) === String(d.giftId))?.image || '',
      },
    });
  });
  c.on(WebcastEvent.FOLLOW, (d) => handleEvent({ type: 'follow', user: userOf(d.user) }));
  c.on(WebcastEvent.SHARE, (d) => handleEvent({ type: 'share', user: userOf(d.user) }));
  c.on(WebcastEvent.LIKE, (d) => handleEvent({ type: 'like', user: userOf(d.user), likeCount: d.likeCount || 1 }));
  c.on(WebcastEvent.CHAT, (d) => handleEvent({ type: 'chat', user: userOf(d.user), comment: d.comment || '' }));
  c.on(WebcastEvent.MEMBER, (d) => handleEvent({ type: 'join', user: userOf(d.user) }));
  c.on(WebcastEvent.STREAM_END, () => { log('Your stream ended'); wantConnected = false; setStatus('offline', 'Stream ended'); });
  c.on(ControlEvent.DISCONNECTED, () => {
    if (tt !== c) return;
    if (wantConnected && data.settings.autoReconnect) scheduleReconnect('Disconnected — reconnecting in 10s…', 10000);
    else setStatus('offline', 'Disconnected');
  });
  c.on(ControlEvent.ERROR, ({ info } = {}) => { if (info) log('TikTok: ' + info, 'warn'); });

  try {
    const state = await c.connect();
    engine.reset();
    Object.keys(stats).forEach((k) => (stats[k] = 0));
    send('stats', stats);
    setStatus('live', `Live as @${username}`);
    log(`Connected to @${username}'s LIVE (room ${state.roomId})`, 'good');
    try {
      const gifts = c.availableGifts || (await c.fetchAvailableGifts());
      const n = setGifts(gifts);
      if (n) log(`Loaded ${n} gifts from TikTok`);
    } catch { /* optional */ }
  } catch (e) {
    const msg = String(e?.message || e);
    const offline = /offline|not live|UserOffline/i.test(msg + (e?.name || ''));
    if (wantConnected && data.settings.autoReconnect) {
      scheduleReconnect(offline ? `@${username} isn't live yet — checking again in 30s…` : `Couldn't connect (${msg}) — retrying in 30s…`, 30000);
    } else setStatus('error', offline ? `@${username} isn't live right now` : `Couldn't connect: ${msg}`);
  }
}
function scheduleReconnect(text, ms) {
  setStatus('waiting', text);
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => { if (wantConnected) connectTikTok(); }, ms);
}
async function disconnectTikTok() {
  wantConnected = false;
  clearTimeout(reconnectTimer);
  if (tt) { const c = tt; tt = null; try { await c.disconnect(); } catch {} }
  setStatus('offline', 'Not connected');
}

// ---------- games ----------
function detectEngine(exe) {
  try {
    const dir = path.dirname(exe);
    const base = path.basename(exe, path.extname(exe));
    const dataDir = path.join(dir, base + '_Data');
    const bep = fs.existsSync(path.join(dir, 'BepInEx'));
    if (fs.existsSync(dataDir) || fs.existsSync(path.join(dir, 'UnityPlayer.dll'))) {
      if (fs.existsSync(path.join(dir, 'GameAssembly.dll'))) return { engine: 'Unity (IL2CPP)', moddable: 'harder', bepinex: bep };
      if (fs.existsSync(path.join(dataDir, 'Managed', 'Assembly-CSharp.dll'))) return { engine: 'Unity (Mono)', moddable: 'easy', bepinex: bep };
      return { engine: 'Unity', moddable: 'unknown', bepinex: bep };
    }
    return { engine: 'Other', moddable: 'keys only', bepinex: bep };
  } catch { return { engine: 'Unknown', moddable: 'unknown', bepinex: false }; }
}
async function exeIcon(exe) {
  try { const img = await app.getFileIcon(exe, { size: 'large' }); return img.toDataURL(); } catch { return ''; }
}
function copyToStore(file, sub) {
  const dir = path.join(app.getPath('userData'), sub);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, Date.now() + '-' + path.basename(file));
  fs.copyFileSync(file, dest);
  return dest;
}

// ---------- updates ----------
let updater = null;
let updateInfo = null;
let updateState = { state: 'idle' };
const setUpdate = (s) => { updateState = s; send('update', s); };
function initUpdater() {
  const repo = require('../package.json').blummods?.updateRepo;
  if (!repo) return;
  const resourcesDir = process.env.BLUM_UPDATE_RESOURCES || (app.isPackaged ? process.resourcesPath : null);
  if (!resourcesDir) return; // running from source: nothing to swap
  updater = new Updater({
    repo, currentVersion: app.getVersion(), resourcesDir, workDir: path.join(app.getPath('userData'), 'updates'),
    ...(process.env.BLUM_UPDATE_API ? { apiBase: process.env.BLUM_UPDATE_API } : {}),
  });
  updater.cleanup();
  setTimeout(() => checkForUpdate(false), 4000);
  setInterval(() => checkForUpdate(false), 3 * 60 * 60 * 1000);
}
async function checkForUpdate(manual) {
  if (!updater) { if (manual) setUpdate({ state: 'none', manual, text: 'Updates only work in the installed app.' }); return; }
  if (['downloading', 'restarting'].includes(updateState.state)) return;
  try {
    const info = await updater.check();
    if (info) { updateInfo = info; setUpdate({ state: 'available', version: info.version, notes: info.notes }); }
    else if (manual) setUpdate({ state: 'none', manual, text: `You're on the latest version (v${app.getVersion()}).` });
  } catch (e) { if (manual) setUpdate({ state: 'error', manual, text: String(e.message || e) }); }
}
async function installUpdate() {
  if (!updater || !updateInfo || updateState.state === 'downloading') return;
  const info = updateInfo;
  try {
    setUpdate({ state: 'downloading', version: info.version, pct: 0 });
    const file = await updater.download(info, (pct) => setUpdate({ state: 'downloading', version: info.version, pct }));
    updater.stage(file, info);
    setUpdate({ state: 'restarting', version: info.version });
    keys?.stop();
    try { updater.apply(); }
    catch (e) {
      if (process.platform !== 'win32') throw e;
      // Windows wouldn't let go of the folder while we're running: swap it right after we close.
      const cmd = path.join(app.getPath('userData'), 'updates', 'swap.cmd');
      fs.writeFileSync(cmd, ['@echo off', 'cd /d "%~1"', 'for /l %%i in (1,1,30) do (', '  move /y app app-old >nul 2>&1 && goto swapped', '  timeout /t 1 /nobreak >nul', ')', 'goto launch', ':swapped', 'move /y app-new app >nul 2>&1 || move /y app-old app >nul 2>&1', ':launch', 'start "" "%~2"', ''].join('\r\n'));
      fs.rmSync(updater.oldDir, { recursive: true, force: true });
      spawn('cmd.exe', ['/c', cmd, updater.resourcesDir, process.execPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      setTimeout(() => app.exit(0), 300);
      return;
    }
    setTimeout(() => { app.relaunch(); app.exit(0); }, 900);
  } catch (e) {
    setUpdate({ state: 'error', version: info.version, text: `Update failed: ${String(e.message || e)}` });
  }
}

// ---------- IPC ----------
function wireIpc() {
  ipcMain.handle('update-check', () => checkForUpdate(true));
  ipcMain.handle('update-install', () => installUpdate());
  ipcMain.handle('get-init', () => ({ update: updateState, gifts: giftCatalog, data, status, stats, keyChoices: KEY_CHOICES, mods: [...mods.values()], userData: app.getPath('userData'), version: app.getVersion() }));
  ipcMain.handle('save', (_e, next) => {
    const portChanged = next.settings?.port !== data.settings.port;
    data = next; save();
    if (portChanged) { try { server.close(); } catch {} startServer(); }
    return true;
  });
  ipcMain.handle('connect', () => connectTikTok());
  ipcMain.handle('refresh-gifts', async () => {
    try {
      let c = tt;
      if (!c || !c.roomId) {
        const username = String(data.settings.username || '').trim().replace(/^@/, '');
        if (!username) return { ok: false, error: 'Type your TikTok username at the top first.' };
        const { TikTokLiveConnection } = await import('tiktok-live-connector');
        c = new TikTokLiveConnection(username, data.settings.signApiKey ? { signApiKey: data.settings.signApiKey } : {});
        await c.fetchRoomId();
      }
      const n = setGifts(await c.fetchAvailableGifts());
      return n ? { ok: true, count: n } : { ok: false, error: 'TikTok sent back an empty gift list.' };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });
  ipcMain.handle('disconnect', () => disconnectTikTok());
  ipcMain.handle('simulate', (_e, ev) => handleEvent(ev));
  ipcMain.handle('test-actions', (_e, { name, actions }) => enqueue(name || 'Test', actions || [], {
    type: 'gift', user: { uniqueId: 'test_viewer', nickname: 'Test Viewer' }, gift: { name: 'Rose', diamonds: 1, count: 1 }, comment: '', likeCount: 1,
  }));
  ipcMain.handle('clear-queue', () => { queue.length = 0; send('queue', 0); });
  ipcMain.handle('reset-session', () => { engine.reset(); Object.keys(stats).forEach((k) => (stats[k] = 0)); send('stats', stats); });
  ipcMain.handle('pick-exe', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Pick the game .exe', properties: ['openFile'], filters: [{ name: 'Games', extensions: ['exe', 'lnk', 'url'] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const exe = r.filePaths[0];
    return { exe, name: path.basename(exe, path.extname(exe)), icon: await exeIcon(exe), ...detectEngine(exe) };
  });
  ipcMain.handle('pick-image', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Pick cover art', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return pathToFileURL(copyToStore(r.filePaths[0], 'covers')).href;
  });
  ipcMain.handle('pick-sound', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Pick a sound', properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return copyToStore(r.filePaths[0], 'sounds');
  });
  ipcMain.handle('launch-game', async (_e, id) => {
    const g = data.games.find((x) => x.id === id);
    if (!g) return false;
    data.activeGameId = id; save();
    if (/\.(lnk|url)$/i.test(g.exe)) { const err = await shell.openPath(g.exe); if (err) log(err, 'bad'); }
    else {
      try { spawn(g.exe, g.launchArgs ? g.launchArgs.split(' ') : [], { cwd: path.dirname(g.exe), detached: true, stdio: 'ignore' }).unref(); }
      catch (e) { log(`Couldn't launch ${g.name}: ${e.message}`, 'bad'); return false; }
    }
    log(`Launched ${g.name} — its rules are now active`, 'good');
    return true;
  });
  ipcMain.handle('open-folder', (_e, p) => shell.openPath(p && fs.existsSync(p) && fs.statSync(p).isFile() ? path.dirname(p) : p));
  ipcMain.handle('open-url', (_e, u) => { if (/^https?:\/\//.test(u)) shell.openExternal(u); });
  ipcMain.handle('export-data', async () => {
    const r = await dialog.showSaveDialog(win, { title: 'Back up BlumMods setup', defaultPath: 'blummods-backup.json' });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2)); return true;
  });
  ipcMain.handle('import-data', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Restore BlumMods backup', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const d = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    data = { ...DEFAULT_DATA, ...d, settings: { ...DEFAULT_DATA.settings, ...(d.settings || {}) } }; save();
    return data;
  });
}

app.whenReady().then(() => {
  load();
  loadGifts();
  keys = new KeySender(app.getPath('userData'), log);
  if (process.platform === 'win32') setTimeout(() => keys.ensure(), 1500); // warm up so the first press isn't cut short
  wireIpc();
  createWindow();
  startServer();
  initUpdater();
});
app.on('window-all-closed', () => { keys?.stop(); app.quit(); });
