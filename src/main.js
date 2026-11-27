const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { WebSocketServer } = require('ws');
const { RuleEngine, fillTemplate } = require('./rules');
const { KeySender, KEY_CHOICES } = require('./keys');
const { Updater } = require('./updater');
const { toTikFinity } = require('./feed');
const modloader = require('./modloader');
const autoadd = require('./autoadd');

app.setName('BlumMods');
if (process.platform === 'win32') app.setAppUserModelId('com.blummods.app');
if (!app.requestSingleInstanceLock()) app.quit();

// ---------- storage ----------
const DATA_FILE = () => path.join(app.getPath('userData'), 'blummods-data.json');
const DEFAULT_DATA = {
  settings: { username: '', signApiKey: '', autoReconnect: true, dedupeFollows: true, port: 21777, keyGapMs: 60, feedOn: true, feedPort: 21213, keysOn: true },
  activeGameId: null,
  games: [],
  rules: [],
  autoAdded: [], // exe names the app added by itself once; if he removes one, it is never added again
};
let data = structuredClone(DEFAULT_DATA);
// Everything that becomes app data (saved file, restored backup, what the window sends) is cleaned here first.
const TRIGGER_TYPES = ['gift', 'follow', 'like', 'share', 'chat', 'join'];
const ACTION_KINDS = ['game', 'key', 'mod', 'alert', 'sound', 'wait'];
const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
function cleanAction(a) {
  if (!a || !ACTION_KINDS.includes(a.kind)) return null;
  switch (a.kind) {
    case 'game': return { kind: 'game', action: str(a.action, 60).replace(/[^\w.-]/g, ''), params: Object.fromEntries(Object.entries(a.params && typeof a.params === 'object' ? a.params : {}).slice(0, 12).map(([k, v]) => [str(k, 40).replace(/[^\w]/g, ''), num(v, 0, -1e15, 1e15)])) };
    case 'key': return { kind: 'key', key: str(a.key, 40), holdMs: num(a.holdMs, 80, 20, 10000), repeat: num(a.repeat, 1, 1, 50) };
    case 'mod': return { kind: 'mod', command: str(a.command, 100), args: str(a.args, 300) };
    case 'alert': return { kind: 'alert', text: str(a.text, 300), color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : '#25f4ee', seconds: num(a.seconds, 4, 1, 60) };
    case 'sound': return { kind: 'sound', file: str(a.file, 500), volume: num(a.volume, 80, 0, 100) };
    case 'wait': return { kind: 'wait', ms: num(a.ms, 500, 0, 60000) };
  }
  return null;
}
function cleanData(d) {
  d = d && typeof d === 'object' ? d : {};
  const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
  const games = (Array.isArray(d.games) ? d.games : []).slice(0, 500).filter((g) => g && typeof g === 'object' && g.id && g.exe).map((g) => ({
    id: str(g.id, 40), name: str(g.name, 120) || 'Game', exe: str(g.exe, 500), launchArgs: str(g.launchArgs, 300),
    icon: /^data:image\//.test(g.icon || '') ? String(g.icon).slice(0, 400000) : '', cover: /^file:/.test(g.cover || '') ? str(g.cover, 600) : '',
    engine: str(g.engine, 40), moddable: str(g.moddable, 20), addedAt: num(g.addedAt, 0, 0, 1e14),
  }));
  const ids = new Set(games.map((g) => g.id));
  const rules = (Array.isArray(d.rules) ? d.rules : []).slice(0, 2000).filter((r) => r && typeof r === 'object' && r.id && TRIGGER_TYPES.includes(r.trigger?.type)).map((r) => ({
    id: str(r.id, 40), gameId: ids.has(r.gameId) ? r.gameId : null, name: str(r.name, 120) || 'Trigger', enabled: r.enabled !== false,
    trigger: { type: r.trigger.type, giftName: str(r.trigger.giftName, 80), minDiamonds: num(r.trigger.minDiamonds, 0, 0, 1e9), likeEvery: num(r.trigger.likeEvery, 100, 1, 1e9), command: str(r.trigger.command, 80) },
    repeatPerGift: !!r.repeatPerGift, cooldownSec: num(r.cooldownSec, 0, 0, 86400),
    actions: (Array.isArray(r.actions) ? r.actions : []).slice(0, 20).map(cleanAction).filter(Boolean),
  }));
  return {
    settings: {
      username: str(s.username, 60).replace(/[^\w.]/g, ''), signApiKey: str(s.signApiKey, 200),
      autoReconnect: s.autoReconnect !== false, dedupeFollows: s.dedupeFollows !== false,
      port: num(s.port, 21777, 1024, 65535), keyGapMs: num(s.keyGapMs, 60, 0, 5000),
      feedOn: s.feedOn !== false, feedPort: num(s.feedPort, 21213, 1024, 65535), keysOn: s.keysOn !== false,
    },
    activeGameId: ids.has(d.activeGameId) ? d.activeGameId : null, games, rules,
    autoAdded: (Array.isArray(d.autoAdded) ? d.autoAdded : []).slice(0, 500).map((e) => str(e, 120).toLowerCase()).filter(Boolean),
  };
}
function load() {
  try { data = cleanData(JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'))); } catch { /* first run */ }
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
    const key = name.toLowerCase() + '|' + (Number(g?.diamond_count ?? g?.diamonds ?? 0) || 0); // same name can exist at several prices
    if (!name || seen.has(key)) continue;
    seen.add(key);
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

// TikTok's public gift list: no login, no room and no going live needed.
const GIFT_LIST_URL = 'https://webcast.tiktok.com/webcast/gift/list/?aid=1988&app_name=tiktok_web&device_platform=web_pc&app_language=en-US&webcast_language=en-US&region=US&priority_region=US';
async function fetchGiftsDirect() {
  const res = await net.fetch(GIFT_LIST_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TikTok answered ${res.status}`);
  const json = await res.json();
  const n = setGifts(json?.data?.gifts);
  if (!n) throw new Error('TikTok sent back an empty gift list');
  return n;
}
function giftsAreStale() {
  try { return Date.now() - fs.statSync(GIFTS_FILE()).mtimeMs > 7 * 24 * 60 * 60 * 1000; } catch { return true; }
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false },
  });
  win.removeMenu();
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ---------- local server: game mods + stream overlay ----------
// Games, plugins and local overlay pages may connect. A website open in a browser may not.
// (Programs send no Origin; browsers always do, and it names the site the page came from.)
function localOrigin(origin) {
  if (!origin || origin === 'null' || origin.startsWith('file:')) return true;
  try { return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname) || /^(app|absolute|obs):/.test(origin); } catch { return false; }
}
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
  modWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  overlayWss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  server.on('upgrade', (req, sock, head) => {
    if (!localOrigin(req.headers.origin)) return sock.destroy();
    const target = req.url.startsWith('/overlay') ? overlayWss : req.url.startsWith('/mods') || req.url === '/' ? modWss : null;
    if (!target) return sock.destroy();
    target.handleUpgrade(req, sock, head, (ws) => target.emit('connection', ws, req));
  });
  modWss.on('connection', (ws) => {
    if (mods.size >= 16) return ws.close();
    mods.set(ws, { game: 'Unknown mod' });
    modsStatus();
    ws.on('message', (m) => {
      try {
        const msg = JSON.parse(m.toString());
        if (msg.type === 'hello') { mods.set(ws, { game: String(msg.game || 'Mod').slice(0, 60) }); modsStatus(); log(`${msg.game} connected${msg.plugin ? ` (plugin v${msg.plugin})` : ''}`, 'good'); }
        else if (msg.type === 'log') log(`[${mods.get(ws)?.game}] ${String(msg.text || '').slice(0, 300)}`);
      } catch { /* ignore */ }
    });
    ws.on('close', () => { mods.delete(ws); modsStatus(); });
  });
  server.on('error', (e) => log(`Mod server error on port ${port}: ${e.message}`, 'bad'));
  server.listen(port, '127.0.0.1', () => log(`Mod server ready on ws://127.0.0.1:${port}/mods`));
}
// ---------- TikFinity-style feed: games with built-in TikFinity support connect here ----------
let feedWss = null;
const feedStatus = () => send('feed', { on: !!feedWss, port: Number(data.settings.feedPort) || 21213, clients: feedWss ? feedWss.clients.size : 0 });
function stopFeed() { if (feedWss) { try { for (const c of feedWss.clients) c.terminate(); feedWss.close(); } catch {} feedWss = null; } feedStatus(); }
function startFeed() {
  stopFeed();
  if (!data.settings.feedOn) return;
  const port = Number(data.settings.feedPort) || 21213;
  const wss = new WebSocketServer({ host: '127.0.0.1', port, maxPayload: 4 * 1024, verifyClient: (info) => localOrigin(info.origin) });
  wss.on('listening', () => { feedWss = wss; feedStatus(); log(`Game feed ready on port ${port} (games that support TikFinity connect to this)`); });
  wss.on('error', (e) => {
    if (feedWss === wss) feedWss = null;
    log(e.code === 'EADDRINUSE' ? `Game feed couldn't start: port ${port} is taken. Close TikFinity (it uses the same port), then turn the feed off and on in Settings.` : `Game feed error: ${e.message}`, 'warn');
    feedStatus();
  });
  wss.on('connection', (ws) => {
    log('A game connected to the game feed', 'good'); feedStatus();
    ws.on('close', () => { log('A game disconnected from the game feed'); feedStatus(); });
    ws.on('error', () => {});
  });
}
function feedEvent(ev) {
  if (!feedWss || !feedWss.clients.size) return;
  const msg = toTikFinity(ev);
  if (msg) broadcast(feedWss, msg);
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
        gift: ev.gift?.name || '', count: ev.gift?.count || 1, coins: ev.gift?.diamonds || 0, diamonds: ev.gift?.diamonds || 0, comment: ev.comment || '',
      });
      if (!mods.size) log(`Mod command "${a.command}" sent, but no game mod is connected`, 'warn');
      break;
    case 'game': {
      const params = a.params || {};
      const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => ['p_' + k, Number(v) || 0]));
      broadcast(modWss, {
        type: 'command', command: a.action, params, ...flat,
        event: ev.type, user: ev.user?.uniqueId || '', nickname: ev.user?.nickname || '',
        gift: ev.gift?.name || '', count: ev.gift?.count || 1, coins: ev.gift?.diamonds || 0, comment: ev.comment || '',
      });
      if (!mods.size) log(`Game action "${a.action}" sent, but the game isn't connected. Launch it from BlumMods and wait for the green "connected" line.`, 'warn');
      break;
    }
    case 'sound':
      if (a.file && /\.(mp3|wav|ogg|m4a)$/i.test(a.file) && fs.existsSync(a.file)) send('play-sound', { url: pathToFileURL(a.file).href, volume: (Number(a.volume) || 0) / 100 });
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
  // Game triggers belong to one game; key-press triggers (no game) are universal and share one master switch.
  return data.rules.filter((r) => r.enabled && (r.gameId ? r.gameId === data.activeGameId : data.settings.keysOn !== false));
}

function handleEvent(ev) {
  if (ev.type === 'gift') { stats.gifts += ev.gift.count; stats.diamonds += ev.gift.diamonds * ev.gift.count; }
  if (ev.type === 'follow') stats.follows++;
  if (ev.type === 'share') stats.shares++;
  const fired = engine.match(ev, activeRules(), { dedupeFollows: data.settings.dedupeFollows });
  feedEvent(ev);
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
let lastRoomId = '';
let reconnectTimer = null;
let status = { state: 'offline', text: 'Not connected' };
const setStatus = (state, text) => { status = { state, text }; send('status', status); };
const userOf = (u) => ({
  uniqueId: u?.uniqueId || '', nickname: u?.nickname || u?.uniqueId || '', userId: u?.userId ? String(u.userId) : '',
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
        id: d.giftId, giftType: g.giftType, name: g.giftName || d.extendedGiftInfo?.name || `Gift ${d.giftId}`,
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
    if (state.roomId !== lastRoomId) { // a new stream, not a reconnect to the same one
      lastRoomId = state.roomId;
      engine.reset();
      Object.keys(stats).forEach((k) => (stats[k] = 0));
      send('stats', stats);
    }
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

// ---------- game plugins (the in-game half of BlumMods) ----------
const MANIFEST_FILE = () => path.join(app.getPath('userData'), 'plugins.json');
let pluginManifest = { games: [] };
function cleanManifest(m) {
  const games = (Array.isArray(m?.games) ? m.games : []).slice(0, 200).filter((g) => g && /^[\w.-]+\.dll$/i.test(g.file || '') && /^[0-9a-f]{64}$/i.test(g.sha256 || '')).map((g) => ({
    id: str(g.id, 60), name: str(g.name, 120), exe: (Array.isArray(g.exe) ? g.exe : []).slice(0, 10).map((e) => str(e, 120)), file: g.file, version: str(g.version, 20).replace(/[^\w.-]/g, ''), sha256: g.sha256.toLowerCase(),
    actions: (Array.isArray(g.actions) ? g.actions : []).slice(0, 300).filter((a) => a && /^[\w.-]{1,60}$/.test(a.id || '')).map((a) => ({
      id: a.id, label: str(a.label, 80) || a.id, category: str(a.category, 40), icon: str(a.icon, 8), desc: str(a.desc, 400),
      params: (Array.isArray(a.params) ? a.params : []).slice(0, 12).filter((p) => p && /^\w{1,40}$/.test(p.id || '')).map((p) => ({ id: p.id, name: str(p.name, 40), label: str(p.label, 40), default: num(p.default, 0, -1e15, 1e15), min: num(p.min, 0, -1e15, 1e15), max: num(p.max, 1e15, -1e15, 1e15), step: num(p.step, 1, 0.0001, 1e12) })),
    })),
  }));
  return { games };
}
function loadManifest() { try { pluginManifest = cleanManifest(JSON.parse(fs.readFileSync(MANIFEST_FILE(), 'utf8'))); } catch { /* none yet */ } }
const modStatuses = () => Object.fromEntries(data.games.map((g) => [g.id, modloader.status(g, pluginManifest)]));
async function refreshManifest() {
  try {
    const res = await net.fetch(modloader.PLUGINS_BASE + 'plugins.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const m = await res.json();
    if (Array.isArray(m.games)) { pluginManifest = cleanManifest(m); fs.writeFileSync(MANIFEST_FILE(), JSON.stringify(m)); send('plugins', { manifest: pluginManifest, statuses: modStatuses() }); }
  } catch { /* offline: keep the saved list */ }
}
// Put the newest plugin into every game that has the mod loader and a plugin available.
async function syncPlugins() {
  for (const g of data.games) {
    const st = modloader.status(g, pluginManifest);
    if (!st.hasActions || st.state === 'none' || st.state === 'unsupported' || st.plugin === st.pluginLatest) continue;
    try {
      await modloader.installPlugin(g, modloader.pluginFor(g, pluginManifest), (u) => net.fetch(u, { cache: 'no-store' }));
      log(`${g.name}: BlumMods plugin v${st.pluginLatest} installed${st.plugin ? ' (updated)' : ''}`, 'good');
    } catch (e) { log(`${g.name}: couldn't install the BlumMods plugin (${e.message})`, 'warn'); }
  }
  send('plugins', { manifest: pluginManifest, statuses: modStatuses() });
}
// Every game that has a BlumMods plugin and is installed in Steam gets a card by itself (once).
const pendingAuto = new Set(); // ids the window hasn't confirmed yet, so a save from it can't drop them
async function autoAddGames() {
  let found = [];
  try { found = autoadd.gamesToAdd(pluginManifest.games, data.games, data.autoAdded, autoadd.steamLibraries()); } catch (e) { log(`Couldn't look for modded games in Steam (${e.message})`, 'warn'); return; }
  if (!found.length) return;
  const added = [];
  for (const { entry, exe } of found) {
    const g = { id: Math.random().toString(36).slice(2, 10), name: entry.name || path.basename(exe, '.exe'), exe, launchArgs: '', icon: await exeIcon(exe), cover: '', ...detectEngine(exe), addedAt: Date.now() };
    delete g.bepinex;
    data.games.push(g); added.push(g); pendingAuto.add(g.id);
    data.autoAdded.push(...(entry.exe || []).map((e) => String(e).toLowerCase()));
    log(`${g.name} has a BlumMods mod, so it was added to your games`, 'good');
  }
  data = cleanData(data); save();
  send('games-added', { games: data.games.filter((g) => pendingAuto.has(g.id)), autoAdded: data.autoAdded });
}
// BLUM_NO_SYNC (dev screenshots only): never touch real game folders from a test run.
const refreshPlugins = async () => { if (process.env.BLUM_NO_SYNC) return; await refreshManifest(); await autoAddGames(); await syncPlugins(); };

// ---------- updates ----------
let updater = null;
let updateInfo = null;
let updateState = { state: 'idle' };
const setUpdate = (s) => { updateState = s; send('update', s); };
function initUpdater() {
  const repo = require('../package.json').blummods?.updateRepo;
  if (!repo) return;
  const dev = !app.isPackaged; // the BLUM_UPDATE_* test switches do nothing in the installed app
  const resourcesDir = app.isPackaged ? process.resourcesPath : process.env.BLUM_UPDATE_RESOURCES || null;
  if (!resourcesDir) return; // running from source: nothing to swap
  updater = new Updater({
    repo, currentVersion: app.getVersion(), resourcesDir, workDir: path.join(app.getPath('userData'), 'updates'),
    ...(dev && process.env.BLUM_UPDATE_API ? { apiBase: process.env.BLUM_UPDATE_API } : {}),
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
const APP_PAGE = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;
function wireIpc() {
  // Refuse commands from anything that is not BlumMods' own page.
  const realHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, fn) => realHandle(channel, (e, ...args) => {
    const from = e.senderFrame ? e.senderFrame.url : '';
    if (from.split(/[?#]/)[0] !== APP_PAGE) throw new Error('blocked');
    return fn(e, ...args);
  });
  ipcMain.handle('mod-status', () => modStatuses());
  ipcMain.handle('plugins-refresh', async () => { await refreshPlugins(); return { manifest: pluginManifest, statuses: modStatuses() }; });
  ipcMain.handle('mod-install', async (_e, id) => {
    const g = data.games.find((x) => x.id === id);
    if (!g) return { ok: false, error: 'Game not found' };
    try {
      log(`Installing the mod loader for ${g.name}…`);
      await modloader.install(g, (u) => net.fetch(u), (pct) => send('mod-progress', { id, pct }));
      log(`Mod loader installed for ${g.name}. Launch the game once and let it reach the main menu to finish setup.`, 'good');
      await syncPlugins();
      return { ok: true, statuses: modStatuses() };
    } catch (e) { log(`Mod loader install failed: ${e.message}`, 'bad'); return { ok: false, error: String(e.message || e), statuses: modStatuses() }; }
  });
  ipcMain.handle('mod-remove', (_e, id) => {
    const g = data.games.find((x) => x.id === id);
    if (!g) return { ok: false };
    try { modloader.uninstall(g); log(`Mod loader removed from ${g.name}`); return { ok: true, statuses: modStatuses() }; }
    catch (e) { return { ok: false, error: /EPERM|EBUSY|EACCES/.test(e.code || '') ? 'Close the game first.' : String(e.message || e), statuses: modStatuses() }; }
  });
  ipcMain.handle('update-check', () => checkForUpdate(true));
  ipcMain.handle('update-install', () => installUpdate());
  ipcMain.handle('get-init', () => ({ manifest: pluginManifest, feed: { on: !!feedWss, port: Number(data.settings.feedPort) || 21213, clients: feedWss ? feedWss.clients.size : 0 }, update: updateState, gifts: giftCatalog, data, status, stats, keyChoices: KEY_CHOICES, mods: [...mods.values()], userData: app.getPath('userData'), version: app.getVersion() }));
  ipcMain.handle('save', (_e, next) => {
    const portChanged = next.settings?.port !== data.settings.port;
    const feedChanged = next.settings?.feedOn !== data.settings.feedOn || next.settings?.feedPort !== data.settings.feedPort;
    const fresh = cleanData(next);
    // A save sent before the window heard about auto-added games must not wipe them out.
    for (const id of [...pendingAuto]) {
      if (fresh.games.some((g) => g.id === id)) pendingAuto.delete(id);
      else { const g = data.games.find((x) => x.id === id); if (g) fresh.games.push(g); }
    }
    fresh.autoAdded = [...new Set([...fresh.autoAdded, ...data.autoAdded])];
    data = fresh; save();
    if (feedChanged) startFeed();
    if (portChanged) { try { server.close(); } catch {} startServer(); }
    return true;
  });
  ipcMain.handle('connect', () => connectTikTok());
  ipcMain.handle('refresh-gifts', async () => {
    try { return { ok: true, count: await fetchGiftsDirect() }; } catch { /* fall back to asking through the live room */ }
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
  ipcMain.handle('simulate', (_e, ev) => {
    if (!ev || !TRIGGER_TYPES.includes(ev.type)) return;
    const u = ev.user || {};
    handleEvent({
      type: ev.type, user: { uniqueId: str(u.uniqueId, 60) || 'test_viewer', nickname: str(u.nickname, 60) || 'test_viewer', avatar: '' },
      gift: ev.type === 'gift' ? { name: str(ev.gift?.name, 80) || 'Rose', image: /^https:/.test(ev.gift?.image || '') ? str(ev.gift.image, 600) : '', diamonds: num(ev.gift?.diamonds, 1, 0, 1e9), count: num(ev.gift?.count, 1, 1, 9999) } : undefined,
      likeCount: num(ev.likeCount, 1, 1, 1e6), comment: str(ev.comment, 300),
    });
  });
  ipcMain.handle('test-actions', (_e, { name, actions } = {}) => enqueue(str(name, 120) || 'Test', (Array.isArray(actions) ? actions : []).slice(0, 20).map(cleanAction).filter(Boolean), {
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
    if (!fs.existsSync(g.exe) || !fs.statSync(g.exe).isFile()) { log(`Can't find ${g.name} at ${g.exe}. Edit the game and pick its file again.`, 'bad'); return false; }
    data.activeGameId = id; save();
    await syncPlugins();
    if (/\.(lnk|url)$/i.test(g.exe)) { const err = await shell.openPath(g.exe); if (err) log(err, 'bad'); }
    else {
      try { spawn(g.exe, g.launchArgs ? g.launchArgs.split(' ') : [], { cwd: path.dirname(g.exe), detached: true, stdio: 'ignore' }).unref(); }
      catch (e) { log(`Couldn't launch ${g.name}: ${e.message}`, 'bad'); return false; }
    }
    log(`Launched ${g.name} — its rules are now active`, 'good');
    return true;
  });
  ipcMain.handle('open-folder', (_e, p) => {
    try {
      let dir = path.resolve(String(p || ''));
      if (fs.statSync(dir).isFile()) dir = path.dirname(dir);
      if (fs.statSync(dir).isDirectory()) return shell.openPath(dir);
    } catch { /* not there */ }
    return '';
  });
  ipcMain.handle('open-url', (_e, u) => { if (/^https?:\/\//.test(u)) shell.openExternal(u); });
  ipcMain.handle('export-data', async () => {
    const r = await dialog.showSaveDialog(win, { title: 'Back up BlumMods setup', defaultPath: 'blummods-backup.json' });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2)); return true;
  });
  ipcMain.handle('import-data', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Restore BlumMods backup', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    let d;
    try { d = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { log('That file is not a BlumMods backup', 'bad'); return null; }
    data = cleanData(d); save(); startFeed();
    return data;
  });
}

app.whenReady().then(() => {
  load();
  loadGifts();
  loadManifest();
  keys = new KeySender(app.getPath('userData'), log);
  if (process.platform === 'win32') setTimeout(() => keys.ensure(), 1500); // warm up so the first press isn't cut short
  wireIpc();
  createWindow();
  startServer();
  startFeed();
  initUpdater();
  setTimeout(refreshPlugins, 3000);
  if (!giftCatalog.length || giftsAreStale()) setTimeout(() => fetchGiftsDirect().then((n) => log(`Loaded ${n} gifts from TikTok`)).catch(() => {}), 2500);
});
app.on('window-all-closed', () => { keys?.stop(); app.quit(); });
