/* BlumMods renderer */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n));

let D; // app data
let KEYS = [];
let GIFTS = [
  ['Rose', 1], ['TikTok', 1], ['GG', 1], ['Ice Cream Cone', 1], ['Heart Me', 1], ['Finger Heart', 5],
  ['Rosa', 10], ['Perfume', 20], ['Doughnut', 30], ['Hand Hearts', 100], ['Confetti', 100],
  ['Corgi', 299], ['Money Gun', 500], ['Galaxy', 1000], ['Lion', 29999], ['Universe', 44999],
].map(([name, diamonds]) => ({ name, diamonds }));

let GIFTS_REAL = false; // true once the list came from TikTok
const findGift = (name) => GIFTS.find((g) => g.name.toLowerCase() === String(name || '').trim().toLowerCase());
const giftImg = (g) => (g?.image ? `<img class="gimg" src="${esc(g.image)}" loading="lazy" alt="">` : '<span class="gimg ph">🎁</span>');
// swap broken gift pictures for the placeholder
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t?.tagName === 'IMG' && (t.classList.contains('gimg') || t.classList.contains('gmini'))) {
    if (t.classList.contains('gmini')) return t.remove();
    const ph = document.createElement('span'); ph.className = 'gimg ph'; ph.textContent = '🎁'; t.replaceWith(ph);
  }
}, true);

const PRICE_BANDS = [['all', 'All', 0, Infinity], ['1', '1–9', 1, 9], ['10', '10–99', 10, 99], ['100', '100–999', 100, 999], ['1000', '1,000+', 1000, Infinity]];
// Draws a searchable grid of gift boxes into `mount`. onPick(gift) runs when one is clicked.
function mountGiftGrid(mount, { onPick, selected = '', showCounts = false }) {
  const st = mount._st || (mount._st = { q: '', band: 'all', sort: 'low' });
  mount.innerHTML = `
    <div class="gift-bar">
      <input class="gq" placeholder="Search gifts…" value="${esc(st.q)}" spellcheck="false">
      ${PRICE_BANDS.map(([k, l]) => `<button class="chip ${st.band === k ? 'sel' : ''}" data-band="${k}">${l}</button>`).join('')}
      <select class="gsort"><option value="low">Cheapest first</option><option value="high">Most expensive first</option><option value="name">A–Z</option></select>
      <span class="gift-count"></span>
    </div>
    <div class="gift-grid"></div>`;
  const grid = $('.gift-grid', mount);
  $('.gsort', mount).value = st.sort;
  const draw = () => {
    const band = PRICE_BANDS.find((b) => b[0] === st.band);
    const q = st.q.trim().toLowerCase();
    const list = GIFTS.filter((g) => g.diamonds >= band[2] && g.diamonds <= band[3] && (!q || g.name.toLowerCase().includes(q)))
      .sort((a, b) => (st.sort === 'name' ? a.name.localeCompare(b.name) : st.sort === 'high' ? b.diamonds - a.diamonds || a.name.localeCompare(b.name) : a.diamonds - b.diamonds || a.name.localeCompare(b.name)));
    $('.gift-count', mount).textContent = `${list.length} gift${list.length === 1 ? '' : 's'}`;
    grid.innerHTML = list.map((g) => {
      const n = showCounts ? D.rules.filter((r) => r.trigger?.type === 'gift' && (r.trigger.giftName || '').toLowerCase() === g.name.toLowerCase()).length : 0;
      return `<div class="gift ${selected && selected.toLowerCase() === g.name.toLowerCase() ? 'sel' : ''}" data-name="${esc(g.name)}" title="${esc(g.name)}">
        ${n ? `<span class="has">⚡ ${n}</span>` : ''}${giftImg(g)}<div class="gname">${esc(g.name)}</div><div class="gcost"><i class="coin"></i>${g.diamonds.toLocaleString()}</div></div>`;
    }).join('') || '<div class="empty-small">No gifts match.</div>';
  };
  grid.onclick = (e) => { const el = e.target.closest('.gift'); if (el) onPick(findGift(el.dataset.name)); };
  $('.gq', mount).oninput = (e) => { st.q = e.target.value; draw(); };
  $('.gsort', mount).onchange = (e) => { st.sort = e.target.value; draw(); };
  $$('[data-band]', mount).forEach((b) => (b.onclick = () => { st.band = b.dataset.band; $$('[data-band]', mount).forEach((x) => x.classList.toggle('sel', x === b)); draw(); }));
  draw();
}

// Type-ahead dropdown under a gift name box: picture, name and coin price for each match.
let comboEl = null;
function closeGiftCombo() { if (comboEl) { comboEl.remove(); comboEl = null; } }
function attachGiftCombo(input, onChoose) {
  let items = []; let active = -1;
  const open = () => {
    const q = input.value.trim().toLowerCase();
    items = GIFTS.filter((g) => !q || g.name.toLowerCase().includes(q))
      .sort((a, b) => (q ? (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) : 0) || a.diamonds - b.diamonds || a.name.localeCompare(b.name)).slice(0, 60);
    closeGiftCombo();
    if (!items.length) return;
    active = -1;
    comboEl = document.createElement('div'); comboEl.className = 'gift-combo';
    comboEl.innerHTML = items.map((g, i) => `<div class="gc-item" data-i="${i}">${giftImg(g)}<span class="gc-name">${esc(g.name)}</span><span class="gcost"><i class="coin"></i>${g.diamonds.toLocaleString()}</span></div>`).join('');
    const r = input.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    comboEl.style.left = r.left + 'px'; comboEl.style.width = Math.max(r.width, 280) + 'px';
    if (below >= 200) { comboEl.style.top = r.bottom + 4 + 'px'; comboEl.style.maxHeight = Math.min(340, below) + 'px'; }
    else { comboEl.style.bottom = window.innerHeight - r.top + 4 + 'px'; comboEl.style.maxHeight = Math.min(340, r.top - 12) + 'px'; }
    comboEl.onmousedown = (e) => { e.preventDefault(); const el = e.target.closest('.gc-item'); if (el) choose(items[Number(el.dataset.i)]); };
    document.body.appendChild(comboEl);
  };
  const choose = (g) => { input.value = g.name; closeGiftCombo(); onChoose(g); };
  const mark = () => { $$('.gc-item', comboEl).forEach((el, i) => el.classList.toggle('on', i === active)); $('.gc-item.on', comboEl)?.scrollIntoView({ block: 'nearest' }); };
  input.addEventListener('focus', open);
  input.addEventListener('click', () => { if (!comboEl) open(); });
  input.addEventListener('input', open);
  input.addEventListener('blur', () => setTimeout(closeGiftCombo, 120));
  input.addEventListener('keydown', (e) => {
    if (!comboEl) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopPropagation(); choose(items[active]); }
    else if (e.key === 'Escape') { e.stopPropagation(); closeGiftCombo(); }
  });
}
window.addEventListener('resize', closeGiftCombo);
document.addEventListener('scroll', (e) => { if (comboEl && !comboEl.contains(e.target)) closeGiftCombo(); }, true);

function openGiftPicker(selected, onPick) {
  const close = () => $('#picker').classList.add('hidden');
  mountGiftGrid($('#pickerMount'), { selected, onPick: (g) => { close(); onPick(g); } });
  $('#pickAny').onclick = () => { close(); onPick(null); };
  $('#pickClose').onclick = close;
  $('#picker').onmousedown = (e) => { if (e.target.id === 'picker') close(); };
  $('#picker').classList.remove('hidden');
  $('#pickerMount .gq').focus();
}

function renderGiftsView() {
  $('#giftsNotice').innerHTML = GIFTS_REAL ? '' : '<div class="notice">This is a short starter list without pictures. BlumMods loads the full list from TikTok by itself when it opens (no need to be live). If it has not appeared, click <b>Load from TikTok</b>.</div>';
  mountGiftGrid($('#giftsMount'), {
    showCounts: true,
    onPick: (g) => openRuleModal(null, { trigger: { type: 'gift', giftName: g.name, minDiamonds: 0, likeEvery: 100, command: '!jump' } }),
  });
}

const TRIGGERS = {
  gift: { e: '🎁', label: 'Gift' },
  follow: { e: '➕', label: 'Follow' },
  like: { e: '❤️', label: 'Likes' },
  share: { e: '↗️', label: 'Share' },
  chat: { e: '💬', label: 'Chat cmd' },
  join: { e: '👋', label: 'Joins' },
};
// ---------- persistence ----------
let saveTimer;
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => blum.save(D), 150); }

// ---------- toasts ----------
function toast(text, color) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  if (color) el.style.setProperty('--c', color);
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 3500);
}

// ---------- navigation ----------
function showView(v) {
  $$('.nav').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
  if (v === 'rules') renderRules();
  if (v === 'gifts') renderGiftsView();
}
$$('.nav').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- cover helper ----------
const PALETTE = ['#8a5cff', '#fe2c55', '#25b8f4', '#ff8a3d', '#3ddc84', '#e04fd0'];
function coverHTML(g, cls = '') {
  const color = PALETTE[(g.name || 'x').charCodeAt(0) % PALETTE.length];
  let inner;
  if (g.cover) inner = `<img class="full" src="${esc(g.cover)}">`;
  else if (g.icon) inner = `<img class="icon" src="${esc(g.icon)}">`;
  else inner = `<span class="letter">${esc((g.name || '?')[0].toUpperCase())}</span>`;
  const bg = g.cover ? '' : `style="background:linear-gradient(135deg,${color}55,#15151f 75%)"`;
  return `<div class="cover ${cls}" ${bg}>${inner}</div>`;
}

// ---------- mod loader status ----------
let MODS = {};
let MANIFEST = { games: [] };
// The plugin entry (with its action list) for one of the library's games, matched by .exe name.
function pluginEntry(gameId) {
  const g = D.games.find((x) => x.id === gameId);
  if (!g) return null;
  const exe = String(g.exe || '').split(/[\\/]/).pop().toLowerCase();
  return MANIFEST.games.find((e) => (e.exe || []).some((x) => String(x).toLowerCase() === exe)) || null;
}
const gameActions = (gameId) => pluginEntry(gameId)?.actions || [];
const defaultParams = (act) => Object.fromEntries((act?.params || []).map((p) => [p.id, p.default]));
blum.on('plugins', ({ manifest, statuses }) => { MANIFEST = manifest; MODS = statuses; if ($('#view-games').classList.contains('active') && $('#modal').classList.contains('hidden')) renderGames(); });
// The app found a modded game in Steam and added it by itself.
blum.on('games-added', ({ games, autoAdded }) => {
  if (!D) return;
  const fresh = (games || []).filter((g) => !D.games.some((x) => x.id === g.id));
  D.games.push(...fresh);
  D.autoAdded = autoAdded || D.autoAdded || [];
  if (!fresh.length) return;
  persist();
  if ($('#view-games').classList.contains('active') && $('#modal').classList.contains('hidden')) renderGames();
  toast(`Added ${fresh.map((g) => g.name).join(', ')}: it has a BlumMods mod`);
});
async function refreshMods() { try { MODS = await blum.modStatus(); } catch { /* keep the last known */ } }
function modRowHTML(g) {
  const m = MODS[g.id];
  if (!m || m.state === 'unsupported') return '<span class="mod-note">Keys and game feed only</span>';
  if (m.state === 'none') return '<button class="btn small" data-a="modsetup">🧩 Set up mods</button>';
  if (m.state === 'installed') return '<span class="mod-note warn">Mod loader installed. Launch the game once to finish.</span>';
  
  if (!m.hasActions) return '<span class="mod-note ok">Mod loader ready · no BlumMods plugin for this game yet</span>';
  return `<span class="mod-note ok">Mods ready · plugin ${m.plugin ? 'v' + esc(m.plugin) : 'installing…'}</span>`;
}
blum.on('mod-progress', ({ id, pct }) => { const b = document.querySelector(`[data-mod="${id}"] [data-a=modsetup]`); if (b) b.textContent = `Downloading… ${pct}%`; });
window.addEventListener('focus', async () => { await refreshMods(); if ($('#view-games').classList.contains('active') && $('#modal').classList.contains('hidden')) renderGames(); });

// ---------- games ----------
function renderGames() {
  const grid = $('#gameGrid');
  grid.innerHTML = '';
  for (const g of D.games) {
    const active = g.id === D.activeGameId;
    const ruleCount = D.rules.filter((r) => r.gameId === g.id).length;
    const card = document.createElement('div');
    card.className = 'game' + (active ? ' is-active' : '');
    const modClass = g.moddable === 'easy' ? 'easy' : g.moddable === 'harder' ? 'harder' : '';
    const modText = g.moddable === 'easy' ? 'easy to mod' : g.moddable === 'harder' ? 'harder to mod' : g.moddable === 'keys only' ? 'keys only' : '';
    card.innerHTML = `
      ${coverHTML(g)}
      <div class="game-body">
        <div class="game-name">${esc(g.name)}</div>
        <div class="badges">
          <span class="badge">${esc(g.engine || 'Game')}</span>
          ${modText ? `<span class="badge ${modClass}">${modText}</span>` : ''}
          <span class="badge">${ruleCount} trigger${ruleCount === 1 ? '' : 's'}</span>
        </div>
        <div class="mod-row" data-mod="${g.id}">${modRowHTML(g)}</div>
        <div class="game-actions">
          <button class="btn primary small" data-a="launch">▶ Launch</button>
          <button class="btn small" data-a="rules" title="Edit this game's triggers">⚡</button>
          <button class="btn small" data-a="edit" title="Edit game">✎</button>
        </div>
      </div>`;
    if (active) card.querySelector('.cover').insertAdjacentHTML('beforeend', '<span class="tag">ACTIVE</span>');
    const setup = card.querySelector('[data-a=modsetup]');
    if (setup) setup.onclick = async () => {
      if (!confirm(`Install the BepInEx mod loader into ${g.name}'s folder?\n\nIt downloads about 40 MB from the official BepInEx site and only adds files to the game folder. You can remove it again from the game's edit screen.`)) return;
      setup.disabled = true; setup.textContent = 'Downloading… 0%';
      const r = await blum.modInstall(g.id);
      if (r.statuses) MODS = r.statuses;
      if (r.ok) toast('Mod loader installed. Launch the game once to finish setup.', 'var(--green)'); else toast(`Couldn't install: ${r.error}`, 'var(--red)');
      renderGames();
    };
    card.querySelector('[data-a=launch]').onclick = async () => { await blum.launchGame(g.id); D.activeGameId = g.id; renderAll(); };
    card.querySelector('[data-a=rules]').onclick = () => { D.activeGameId = g.id; persist(); renderAll(); $('#ruleScope').value = g.id; showView('rules'); };
    card.querySelector('[data-a=edit]').onclick = () => openGameModal(g);
    card.querySelector('.cover').onclick = () => { D.activeGameId = g.id; persist(); renderAll(); toast(`${g.name} is now the active game`); };
    card.querySelector('.cover').style.cursor = 'pointer';
    card.querySelector('.cover').title = 'Click to make this the active game';
    grid.appendChild(card);
  }
  const add = document.createElement('button');
  add.className = 'add-card';
  add.innerHTML = '<span class="plus">+</span><b>Add a game</b><span>pick its .exe or shortcut</span>';
  add.onclick = addGame;
  grid.appendChild(add);
}

async function addGame() {
  const picked = await blum.pickExe();
  if (!picked) return;
  openGameModal({ id: null, name: picked.name, exe: picked.exe, icon: picked.icon, engine: picked.engine, moddable: picked.moddable, bepinex: picked.bepinex, cover: '', launchArgs: '' });
}

function openGameModal(g) {
  const draft = { ...g };
  const isNew = !g.id;
  const card = $('#modalCard');
  const draw = () => {
    card.innerHTML = `
      <h2>${isNew ? 'Add game' : 'Edit game'}</h2>
      <div class="cover-edit">${coverHTML(draft)}
        <div class="row wrap"><button class="btn small" id="gCover">Choose cover art</button>
        ${draft.cover ? '<button class="btn small ghost" id="gCoverClear">Remove cover</button>' : ''}</div>
      </div>
      <div class="field"><label>Name</label><input id="gName" value="${esc(draft.name)}"></div>
      <div class="field"><label>Game file</label><div class="row"><input id="gExe" class="grow" value="${esc(draft.exe)}" readonly><button class="btn small" id="gOpen">Open folder</button></div></div>
      <div class="field"><label>Launch options <span class="muted">(optional)</span></label><input id="gArgs" value="${esc(draft.launchArgs || '')}" placeholder="e.g. -windowed"></div>
      <p class="hint">Detected: <b>${esc(draft.engine || 'Unknown')}</b>${draft.moddable === 'easy' ? ' — this one is easy to mod with BepInEx.' : draft.moddable === 'harder' ? ' — IL2CPP build, needs BepInEx 6 (still doable).' : draft.moddable === 'keys only' ? ' — not Unity, so key-press triggers only.' : ''}</p>
      <div class="modal-foot">
        <div class="row">${isNew ? '' : '<button class="btn danger" id="gDelete">Remove game</button>'}${!isNew && ['installed', 'ready'].includes(MODS[g.id]?.state) ? '<button class="btn" id="gUnmod">Remove mod loader</button>' : ''}</div>
        <div class="row"><button class="btn" id="gCancel">Cancel</button><button class="btn primary" id="gSave">${isNew ? 'Add to library' : 'Save'}</button></div>
      </div>`;
    $('#gName').oninput = (e) => (draft.name = e.target.value);
    $('#gArgs').oninput = (e) => (draft.launchArgs = e.target.value);
    $('#gCover').onclick = async () => { const u = await blum.pickImage(); if (u) { draft.cover = u; draw(); } };
    if ($('#gCoverClear')) $('#gCoverClear').onclick = () => { draft.cover = ''; draw(); };
    $('#gOpen').onclick = () => blum.openFolder(draft.exe);
    $('#gCancel').onclick = closeModal;
    $('#gSave').onclick = () => {
      if (!draft.name.trim()) return toast('Give the game a name', 'var(--red)');
      if (isNew) {
        draft.id = uid(); draft.addedAt = Date.now();
        D.games.push(draft);
        if (!D.activeGameId) D.activeGameId = draft.id;
      } else Object.assign(D.games.find((x) => x.id === g.id), draft);
      persist(); closeModal(); renderAll();
      if (isNew) { toast(`${draft.name} added`); setTimeout(async () => { await refreshMods(); renderGames(); }, 400); }
    };
    if ($('#gUnmod')) $('#gUnmod').onclick = async () => {
      if (!confirm(`Remove the mod loader and any mods from ${g.name}? The game itself is not touched.`)) return;
      const r = await blum.modRemove(g.id);
      if (r.statuses) MODS = r.statuses;
      if (r.ok) { toast('Mod loader removed'); closeModal(); renderAll(); } else toast(`Couldn't remove it: ${r.error || 'unknown error'}`, 'var(--red)');
    };
    if ($('#gDelete')) $('#gDelete').onclick = () => {
      if (!confirm(`Remove ${g.name} from BlumMods? Its triggers will be deleted too. (The game itself is not touched.)`)) return;
      D.games = D.games.filter((x) => x.id !== g.id);
      D.rules = D.rules.filter((r) => r.gameId !== g.id);
      if (D.activeGameId === g.id) D.activeGameId = D.games[0]?.id || null;
      persist(); closeModal(); renderAll();
    };
  };
  draw();
  openModal();
}

function renderActiveGame() {
  const g = D.games.find((x) => x.id === D.activeGameId);
  const el = $('#activeGame');
  if (!g) { el.innerHTML = '<span class="none">No game selected — only "All games" triggers are on.</span>'; return; }
  const img = g.cover || g.icon;
  el.innerHTML = `${img ? `<img src="${esc(img)}">` : `<div class="ph" style="background:#8a5cff55"></div>`}<div><div class="nm">${esc(g.name)}</div><div class="muted" style="font-size:11.5px">${D.rules.filter((r) => r.gameId === g.id && r.enabled).length} triggers on</div></div>`;
}

// ---------- rules ----------
function scopeOptions(sel) {
  return `<option value="">All games</option>` + D.games.map((g) => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
}
function renderScope() {
  const s = $('#ruleScope');
  const cur = s.value || D.activeGameId || '';
  s.innerHTML = `<option value="*">Everything</option>` + scopeOptions(cur);
  s.value = D.games.some((g) => g.id === cur) || cur === '' || cur === '*' ? cur : '*';
}
$('#ruleScope').onchange = renderRules;
$('#addRuleBtn').onclick = () => openRuleModal(null);
$('#addGameBtn').onclick = () => addGame();

// ---------- events a trigger can fire (game actions from the plugin + built-ins) ----------
const BUILTIN_EVENTS = [
  { kind: 'key', label: 'Press a key', category: 'Controls', icon: '⌨️', desc: 'Presses a key or mouse button in the game, as if you pressed it yourself. Works in any game, as long as the game window is in front.' },
  { kind: 'alert', label: 'Show an alert', category: 'Stream', icon: '💬', desc: 'Pops a message up in BlumMods and on your stream overlay. Use {nickname}, {gift}, {coins}, {count}, {comment} or {likes} in the text.' },
  { kind: 'wait', label: 'Wait', category: 'Timing', icon: '⏱️', desc: 'Pauses before the next step runs.' },
  { kind: 'mod', label: 'Custom mod command', category: 'Advanced', icon: '🧩', desc: 'Sends a raw command to a game mod. Only needed for mods that are not in the list above.' },
];
function eventCatalog(gameId) {
  return [...gameActions(gameId).map((a) => ({ kind: 'game', action: a.id, label: a.label, category: a.category || 'Game', icon: a.icon || '⚡', desc: a.desc || '', params: a.params || [] })), ...BUILTIN_EVENTS];
}
const sameEvent = (ev, a) => ev.kind === a.kind && (ev.kind !== 'game' || ev.action === a.action);
function eventFor(a, gameId) {
  return eventCatalog(gameId).find((ev) => sameEvent(ev, a))
    || (a.kind === 'game' ? { kind: 'game', action: a.action, label: MANIFEST.games.flatMap((e) => e.actions || []).find((x) => x.id === a.action)?.label || a.action || 'Game action', category: 'Game', icon: '⚡', desc: '', params: [] } : BUILTIN_EVENTS.find((b) => b.kind === a.kind))
    || { kind: a.kind, label: a.kind, category: '', icon: '⚡', desc: '', params: [] };
}
function stepSub(a, ev) {
  switch (a.kind) {
    case 'game': return (ev.params || []).map((p) => `${Number(a.params?.[p.id] ?? p.default).toLocaleString()} ${p.label}`).join(' · ') || ev.category;
    case 'key': return `${a.key || '?'}${Number(a.repeat) > 1 ? ' ×' + a.repeat : ''}`;
    case 'alert': return a.text || '';
    case 'wait': return `${a.ms || 500} ms`;
    case 'mod': return a.command || 'no command yet';
  }
  return '';
}
const coinsText = (n) => `<i class="coin"></i>${Number(n).toLocaleString()} coin${Number(n) === 1 ? '' : 's'}`;
function whenParts(t) {
  switch (t.type) {
    case 'gift': {
      const g = findGift(t.giftName);
      if (t.giftName) return { icon: giftImg(g), title: esc(t.giftName), sub: g ? coinsText(g.diamonds) : 'gift' };
      return { icon: '<span class="gimg ph">🎁</span>', title: 'Any gift', sub: t.minDiamonds ? `worth ${coinsText(t.minDiamonds).replace(' coin', '+ coin')}` : 'every gift counts' };
    }
    case 'follow': return { icon: '<span class="gimg ph">➕</span>', title: 'Follow', sub: 'someone follows you' };
    case 'like': return { icon: '<span class="gimg ph">❤️</span>', title: `${Number(t.likeEvery || 100).toLocaleString()} likes`, sub: 'every time the count is reached' };
    case 'share': return { icon: '<span class="gimg ph">↗️</span>', title: 'Share', sub: 'someone shares your LIVE' };
    case 'chat': return { icon: '<span class="gimg ph">💬</span>', title: t.command ? esc(t.command) : 'Any chat message', sub: 'typed in chat' };
    case 'join': return { icon: '<span class="gimg ph">👋</span>', title: 'Viewer joins', sub: 'someone enters the LIVE' };
  }
  return { icon: '<span class="gimg ph">?</span>', title: '?', sub: '' };
}
const chipHTML = (icon, title, sub, cls = '') => `<span class="chip2 ${cls}"><span class="c-ic">${icon}</span><span class="c-tx"><b>${title}</b><small>${sub}</small></span></span>`;
const whenChip = (t, cls = '') => { const w = whenParts(t); return chipHTML(w.icon, w.title, w.sub, cls); };
function stepChip(a, gameId, cls = '') { const ev = eventFor(a, gameId); return chipHTML(`<span class="gimg ph">${esc(ev.icon)}</span>`, esc(ev.label), esc(stepSub(a, ev)), cls); }
const soundName = (a) => (a.file || '').split(/[\\/]/).pop().replace(/^\d+-/, '') || 'no file yet';
const soundChip = (a, cls = '') => (a ? chipHTML('<span class="gimg ph">🎵</span>', esc(soundName(a)), `Volume ${esc(a.volume ?? 80)}%`, cls) : `<span class="chip2 dashed ${cls}"><span class="c-tx"><b>＋ Add sound</b></span></span>`);

function renderRules() {
  renderScope();
  const scope = $('#ruleScope').value;
  const list = $('#ruleList');
  const rules = D.rules.filter((r) => scope === '*' || (r.gameId || '') === scope);
  if (!rules.length) {
    const g = D.games.find((x) => x.id === scope);
    list.innerHTML = `<div class="empty"><h3>No triggers ${g ? 'for ' + esc(g.name) : 'here'} yet</h3>
      <p>A trigger is “when <b>this</b> happens on my LIVE → do <b>that</b> in my game”.</p>
      <div class="row"><button class="btn primary" id="emptyNew">+ New trigger</button><button class="btn" id="emptyStarter">Add example triggers</button></div></div>`;
    $('#emptyNew').onclick = () => openRuleModal(null);
    $('#emptyStarter').onclick = () => addStarterRules(scope === '*' ? D.activeGameId : scope || null);
    return;
  }
  list.innerHTML = `<div class="rule-head"><span>When viewers</span><span></span><span>This happens</span><span>Sound</span><span>On</span><span>Test</span><span></span><span></span></div>`;
  for (const r of rules) {
    const g = D.games.find((x) => x.id === r.gameId);
    const steps = (r.actions || []).filter((a) => a.kind !== 'sound');
    const sound = (r.actions || []).find((a) => a.kind === 'sound');
    const el = document.createElement('div');
    el.className = 'rule2' + (r.enabled ? '' : ' off');
    el.title = `${r.name}${scope === '*' ? ' · ' + (g ? g.name : 'All games') : ''}${r.cooldownSec ? ` · ${r.cooldownSec}s cooldown` : ''}`;
    el.innerHTML = `
      <button class="cell" data-a="when">${whenChip(r.trigger)}</button>
      <span class="arrow2">→</span>
      <button class="cell" data-a="then">${steps.length ? stepChip(steps[0], r.gameId) : '<span class="chip2 dashed"><span class="c-tx"><b>＋ Pick what happens</b></span></span>'}${steps.length > 1 ? `<span class="more">+${steps.length - 1} more</span>` : ''}</button>
      <button class="cell" data-a="sound">${soundChip(sound)}</button>
      <label class="switch"><input type="checkbox" ${r.enabled ? 'checked' : ''}><span></span></label>
      <button class="btn small" data-a="test">▶ Test</button>
      <button class="btn small ghost" data-a="dup" title="Duplicate">⧉</button>
      <button class="btn small ghost" data-a="del" title="Delete">🗑</button>`;
    el.querySelector('input').onchange = (e) => { r.enabled = e.target.checked; persist(); renderRules(); renderActiveGame(); };
    el.querySelector('[data-a=when]').onclick = () => openRuleModal(r, null, 'when');
    el.querySelector('[data-a=then]').onclick = () => openRuleModal(r, null, 0);
    el.querySelector('[data-a=sound]').onclick = () => openRuleModal(r, null, 'sound');
    el.querySelector('[data-a=test]').onclick = () => testActions(r.name, r.actions);
    el.querySelector('[data-a=dup]').onclick = () => { D.rules.splice(D.rules.indexOf(r) + 1, 0, { ...structuredClone(r), id: uid(), name: r.name + ' (copy)' }); persist(); renderRules(); };
    el.querySelector('[data-a=del]').onclick = () => {
      if (!confirm(`Delete the trigger "${r.name}"?`)) return;
      D.rules = D.rules.filter((x) => x.id !== r.id); persist(); renderRules(); renderGames(); renderActiveGame();
    };
    list.appendChild(el);
  }
}

function addStarterRules(gameId) {
  const mk = (name, trigger, actions, extra = {}) => ({ id: uid(), gameId, name, enabled: true, trigger, actions, cooldownSec: 0, repeatPerGift: false, ...extra });
  D.rules.push(
    mk('Rose = jump', { type: 'gift', giftName: 'Rose' }, [{ kind: 'key', key: 'Space', holdMs: 80, repeat: 1 }, { kind: 'alert', text: '{nickname} made me jump! 🌹', color: '#fe2c55', seconds: 3 }], { repeatPerGift: true }),
    mk('Big gift = chaos', { type: 'gift', giftName: '', minDiamonds: 100 }, [{ kind: 'mod', command: 'spawn_enemy', args: '{nickname}' }, { kind: 'alert', text: '{nickname} sent {gift}! 😈', color: '#8a5cff', seconds: 5 }]),
    mk('New follower', { type: 'follow' }, [{ kind: 'alert', text: 'Thanks for the follow, {nickname}!', color: '#25f4ee', seconds: 4 }]),
    mk('Like goal', { type: 'like', likeEvery: 500 }, [{ kind: 'alert', text: '{likes} likes! 🎉', color: '#ffb547', seconds: 4 }]),
    mk('!jump in chat', { type: 'chat', command: '!jump' }, [{ kind: 'key', key: 'Space', holdMs: 80, repeat: 1 }], { cooldownSec: 5 }),
  );
  persist(); renderRules(); renderGames(); renderActiveGame();
  toast('Added 5 example triggers — edit them to fit your game');
}

function newRule() {
  const scope = $('#ruleScope').value;
  return {
    id: null, gameId: scope && scope !== '*' ? scope : D.activeGameId, name: '', enabled: true,
    trigger: { type: 'gift', giftName: 'Rose', minDiamonds: 0, likeEvery: 100, command: '!jump' },
    repeatPerGift: true, cooldownSec: 0, actions: [{ kind: 'key', key: 'Space', holdMs: 80, repeat: 1 }],
  };
}
function firstActionFor(gameId) {
  const act = gameActions(gameId)[0];
  return act ? [{ kind: 'game', action: act.id, params: defaultParams(act) }] : [{ kind: 'key', key: 'Space', holdMs: 80, repeat: 1 }];
}

function defaultAction(kind) {
  return {
    game: { kind, action: '', params: {} },
    key: { kind, key: 'Space', holdMs: 80, repeat: 1 },
    mod: { kind, command: '', args: '' },
    alert: { kind, text: '{nickname} sent {gift}!', color: '#25f4ee', seconds: 4 },
    sound: { kind, file: '', volume: 80 },
    wait: { kind, ms: 500 },
  }[kind];
}

const TRIGGER_INFO = {
  gift: { label: 'Gift', desc: 'A viewer sends a gift. Pick one gift, or any gift worth at least a number of coins.' },
  follow: { label: 'Follow', desc: 'A viewer follows you during the LIVE. Each viewer only counts once per stream.' },
  like: { label: 'Likes', desc: 'The like count passes a number, again and again (every 500 likes, for example).' },
  share: { label: 'Share', desc: 'A viewer shares your LIVE.' },
  chat: { label: 'Chat message', desc: 'A viewer types a word or command in chat.' },
  join: { label: 'Viewer joins', desc: 'A viewer enters your LIVE. Busy streams fire this a lot, so add a cooldown.' },
};

// sel: 'when', 'sound' or the number of the step to open on
function openRuleModal(rule, preset, sel = 'when') {
  const isNew = !rule;
  const r = structuredClone(rule || { ...newRule(), ...(preset || {}) });
  if (isNew) { r.actions = firstActionFor(r.gameId); r.name = ''; sel = 0; }
  let steps = (r.actions || []).filter((a) => a.kind !== 'sound');
  let sound = (r.actions || []).find((a) => a.kind === 'sound') || null;
  if (typeof sel === 'number' && !steps[sel]) sel = steps.length ? 0 : 'when';
  const ui = { sel, q: '', filter: 'all' };
  const t = r.trigger;
  if (!TRIGGERS[t.type]) t.type = 'gift';
  const card = $('#modalCard');
  card.classList.add('wide');
  const allActions = () => [...steps, ...(sound ? [sound] : [])];
  const usedIn = (ev) => D.rules.some((x) => x.id !== r.id && (x.gameId || null) === (r.gameId || null) && (x.actions || []).some((a) => sameEvent(ev, a)));

  const stepper = (attr, value, min, max, step) => `<span class="stepper"><button data-step="-1">−</button><input ${attr} type="number" value="${esc(value)}" ${min !== undefined ? `min="${esc(min)}"` : ''} ${max !== undefined ? `max="${esc(max)}"` : ''} step="${esc(step || 'any')}"><button data-step="1">+</button></span>`;

  const whenPane = () => `
    <div class="pane-list">${Object.entries(TRIGGERS).map(([k, v]) => `
      <button class="ev-item ${t.type === k ? 'sel' : ''}" data-t="${k}"><span class="ev-ic">${v.e}</span><span><b>${TRIGGER_INFO[k].label}</b><small>${TRIGGER_INFO[k].desc}</small></span></button>`).join('')}
    </div>
    <div class="pane-detail">
      <div class="detail-head"><span class="big-ic">${TRIGGERS[t.type].e}</span><div><h3>${TRIGGER_INFO[t.type].label}</h3><p class="hint">${TRIGGER_INFO[t.type].desc}</p></div></div>
      ${t.type === 'gift' ? `
        <div class="prow"><label>Which gift<small>Empty means any gift</small></label><div class="gift-field">${giftImg(findGift(t.giftName))}<input id="tGiftName" autocomplete="off" value="${esc(t.giftName)}" placeholder="any gift"><button class="btn small" id="tGiftBrowse">Browse</button></div></div>
        <div class="prow"><label>Worth at least<small>Coins per gift, 0 for no limit</small></label>${stepper('id="tMin"', t.minDiamonds || 0, 0)}</div>
        <div class="prow"><label>Combos<small>x5 roses fires 5 times (max 20)</small></label><label class="chk"><input type="checkbox" id="tRepeat" ${r.repeatPerGift ? 'checked' : ''}> Fire once for each gift in a combo</label></div>` : ''}
      ${t.type === 'like' ? `<div class="prow"><label>Every<small>likes</small></label>${stepper('id="tLikes"', t.likeEvery || 100, 1)}</div>` : ''}
      ${t.type === 'chat' ? `<div class="prow"><label>Chat says<small>Empty means every message</small></label><input id="tCmd" value="${esc(t.command)}" placeholder="!jump"></div>` : ''}
      <div class="prow"><label>Cooldown<small>Seconds to ignore repeats</small></label>${stepper('id="rCd"', r.cooldownSec || 0, 0)}</div>
      <div class="prow"><label>Works in</label><select id="rScope">${scopeOptions(r.gameId || '')}</select></div>
      <div class="prow"><label>Name<small>Optional</small></label><input id="rName" value="${esc(r.name)}" placeholder="named automatically"></div>
    </div>`;

  const stepDetail = (a, ev) => {
    let body = '';
    if (a.kind === 'game') body = (ev.params || []).map((p) => `<div class="prow"><label>${esc(p.name || p.label)}<small>${esc(p.hint || (p.min !== undefined ? `At least ${p.min}` : ''))}</small></label>${stepper(`data-gp="${esc(p.id)}"`, a.params?.[p.id] ?? p.default, p.min, p.max, p.step)}<span class="unit">${esc(p.label)}</span></div>`).join('') || '<p class="hint">Nothing to set for this one.</p>';
    if (a.kind === 'key') body = `
      <div class="prow"><label>Key<small>Combos like Ctrl+S work too</small></label><input data-f="key" value="${esc(a.key)}" list="keyList" style="width:150px"><button class="btn small" id="recBtn">Record</button></div>
      <div class="prow"><label>Hold for</label>${stepper('data-f="holdMs"', a.holdMs, 20)}<span class="unit">ms</span></div>
      <div class="prow"><label>Press</label>${stepper('data-f="repeat"', a.repeat, 1, 50)}<span class="unit">times</span></div>`;
    if (a.kind === 'alert') body = `
      <div class="prow"><label>Message</label><input data-f="text" value="${esc(a.text)}" style="flex:1"></div>
      <div class="prow"><label>Color</label><input data-f="color" type="color" value="${esc(a.color)}" style="width:54px;padding:2px;height:36px"></div>
      <div class="prow"><label>Show for</label>${stepper('data-f="seconds"', a.seconds, 1)}<span class="unit">seconds</span></div>`;
    if (a.kind === 'wait') body = `<div class="prow"><label>Wait</label>${stepper('data-f="ms"', a.ms, 0)}<span class="unit">ms</span></div>`;
    if (a.kind === 'mod') body = `
      <div class="prow"><label>Command</label><input data-f="command" value="${esc(a.command)}" placeholder="spawn_enemy" style="flex:1"></div>
      <div class="prow"><label>Extra info</label><input data-f="args" value="${esc(a.args)}" placeholder="{nickname}" style="flex:1"></div>`;
    return `
      <div class="detail-head"><span class="big-ic">${esc(ev.icon)}</span><div><h3>${esc(ev.label)}</h3><span class="tag">${esc(ev.category)}</span></div>
        <div class="detail-btns"><button class="btn small" id="stepTest">▶ Test</button>${steps.length > 1 ? '<button class="btn small ghost" id="stepRemove">Remove step</button>' : ''}</div></div>
      <p class="ev-desc">${esc(ev.desc)}</p>
      <div class="pdivider"></div>${body}`;
  };

  const stepPane = (i) => {
    const a = steps[i];
    const cat = eventCatalog(r.gameId);
    const q = ui.q.trim().toLowerCase();
    const counts = { all: cat.length, used: cat.filter(usedIn).length }; counts.unused = counts.all - counts.used;
    const shown = cat.filter((ev) => (!q || (ev.label + ' ' + ev.desc + ' ' + ev.category).toLowerCase().includes(q)) && (ui.filter === 'all' || (ui.filter === 'used') === usedIn(ev)));
    const noPlugin = !gameActions(r.gameId).length;
    return `
      <div class="pane-list">
        <input id="evSearch" placeholder="Search ${cat.length} events" value="${esc(ui.q)}" spellcheck="false">
        <div class="row filt">${[['all', 'All'], ['unused', 'Unused'], ['used', 'Used']].map(([k, l]) => `<button class="chip ${ui.filter === k ? 'sel' : ''}" data-filter="${k}">${l} ${counts[k]}</button>`).join('')}</div>
        <div class="ev-scroll">${shown.map((ev) => `
          <button class="ev-item ${sameEvent(ev, a) ? 'sel' : ''}" data-ev="${cat.indexOf(ev)}"><span class="ev-ic">${esc(ev.icon)}</span><span><b>${esc(ev.label)}</b><small>${esc(ev.desc)}</small></span>${sameEvent(ev, a) ? '<span class="tick">✓</span>' : ''}</button>`).join('') || '<div class="empty-small">Nothing matches.</div>'}
          ${noPlugin ? `<div class="notice" style="margin:10px 4px 0">${r.gameId ? 'This game has no BlumMods plugin yet, so only the general events are listed.' : 'Game events show up when "Works in" is set to a game with a BlumMods plugin.'}</div>` : ''}
        </div>
      </div>
      <div class="pane-detail">${stepDetail(a, eventFor(a, r.gameId))}</div>`;
  };

  const soundPane = () => `
    <div class="pane-detail solo">
      <div class="detail-head"><span class="big-ic">🎵</span><div><h3>Sound</h3><span class="tag">Optional</span></div>
        <div class="detail-btns">${sound ? '<button class="btn small" id="sndTest">▶ Test</button><button class="btn small ghost" id="sndRemove">Remove sound</button>' : ''}</div></div>
      <p class="ev-desc">Plays a sound from BlumMods when this trigger fires. Your stream picks it up along with the rest of your PC audio.</p>
      <div class="pdivider"></div>
      <div class="prow"><label>File<small>mp3, wav, ogg or m4a</small></label><button class="btn small" id="sndPick">${sound?.file ? 'Change sound' : 'Choose a sound'}</button><span class="unit">${sound ? esc(soundName(sound)) : ''}</span></div>
      ${sound ? `<div class="prow"><label>Volume</label><input id="sndVol" type="range" min="0" max="100" value="${esc(sound.volume ?? 80)}" style="width:220px;padding:0"><span class="unit" id="sndVolTx">${esc(sound.volume ?? 80)}%</span></div>` : ''}
    </div>`;

  const draw = () => {
    const g = D.games.find((x) => x.id === r.gameId);
    card.innerHTML = `
      <div class="ed-top"><span class="ed-title">${isNew ? 'New trigger' : 'Trigger'}</span><span class="muted">${g ? esc(g.name) : 'All games'} · TikTok</span><button class="btn small ghost" id="rClose">Esc ✕</button></div>
      <div class="flow">
        <span class="flow-tx">When a viewer</span>
        <button class="flow-btn" data-sel="when">${whenChip(t, ui.sel === 'when' ? 'on' : '')}</button>
        <span class="arrow2">→</span>
        ${steps.map((a, i) => `${i ? '<span class="plus">+</span>' : ''}<button class="flow-btn" data-sel="${i}">${stepChip(a, r.gameId, ui.sel === i ? 'on' : '')}</button>`).join('')}
        <button class="flow-btn" id="addStep" title="Add another thing that happens"><span class="chip2 dashed small"><span class="c-tx"><b>＋ step</b></span></span></button>
        <span class="plus">+</span>
        <button class="flow-btn" data-sel="sound">${soundChip(sound, ui.sel === 'sound' ? 'on' : '')}</button>
      </div>
      <div class="panes">${ui.sel === 'when' ? whenPane() : ui.sel === 'sound' ? soundPane() : stepPane(ui.sel)}</div>
      <div class="modal-foot">
        <div class="row">${isNew ? '' : '<button class="btn danger" id="rDelete">🗑 Delete</button>'}<button class="btn" id="rTest">▶ Test everything</button></div>
        <div class="row"><button class="btn" id="rCancel">Cancel</button><button class="btn primary" id="rSave">Save trigger</button></div>
      </div>`;

    // shared wiring
    $$('[data-sel]', card).forEach((b) => (b.onclick = () => { const v = b.dataset.sel; ui.sel = v === 'when' || v === 'sound' ? v : Number(v); ui.q = ''; draw(); }));
    $('#addStep').onclick = () => { steps.push(firstActionFor(r.gameId)[0]); ui.sel = steps.length - 1; ui.q = ''; draw(); };
    $$('.stepper', card).forEach((s) => {
      const inp = $('input', s);
      $$('button', s).forEach((b) => (b.onclick = () => {
        const step = Number(inp.step) > 0 ? Number(inp.step) : 1;
        let v = Math.round(((Number(inp.value) || 0) + step * Number(b.dataset.step)) * 1000) / 1000;
        if (inp.min !== '' && v < Number(inp.min)) v = Number(inp.min);
        if (inp.max !== '' && v > Number(inp.max)) v = Number(inp.max);
        inp.value = v; inp.dispatchEvent(new Event('input'));
      }));
    });
    $('#rClose').onclick = closeModal;
    $('#rCancel').onclick = closeModal;
    $('#rTest').onclick = () => testActions(r.name || 'Test', allActions());

    if (ui.sel === 'when') {
      $$('[data-t]', card).forEach((el) => (el.onclick = () => { t.type = el.dataset.t; draw(); }));
      $('#rName').oninput = (e) => (r.name = e.target.value);
      $('#rScope').onchange = (e) => { r.gameId = e.target.value || null; draw(); };
      $('#rCd').oninput = (e) => (r.cooldownSec = Math.max(0, Number(e.target.value) || 0));
      if ($('#tGiftName')) {
        $('#tGiftName').oninput = (e) => (t.giftName = e.target.value);
        attachGiftCombo($('#tGiftName'), (gift) => { t.giftName = gift.name; draw(); });
        $('#tGiftBrowse').onclick = () => openGiftPicker(t.giftName, (gift) => { t.giftName = gift ? gift.name : ''; draw(); });
        $('#tMin').oninput = (e) => (t.minDiamonds = Math.max(0, Number(e.target.value) || 0));
        $('#tRepeat').onchange = (e) => (r.repeatPerGift = e.target.checked);
      }
      if ($('#tLikes')) $('#tLikes').oninput = (e) => (t.likeEvery = Math.max(1, Number(e.target.value) || 100));
      if ($('#tCmd')) $('#tCmd').oninput = (e) => (t.command = e.target.value);
    } else if (ui.sel === 'sound') {
      $('#sndPick').onclick = async () => { const f = await blum.pickSound(); if (f) { sound = { kind: 'sound', file: f, volume: sound?.volume ?? 80 }; draw(); } };
      if ($('#sndVol')) $('#sndVol').oninput = (e) => { sound.volume = Number(e.target.value); $('#sndVolTx').textContent = sound.volume + '%'; };
      if ($('#sndTest')) $('#sndTest').onclick = () => blum.testActions({ name: 'Sound', actions: [sound] });
      if ($('#sndRemove')) $('#sndRemove').onclick = () => { sound = null; draw(); };
    } else {
      const a = steps[ui.sel];
      const cat = eventCatalog(r.gameId);
      const search = $('#evSearch');
      search.oninput = () => { ui.q = search.value; const pos = search.selectionStart; draw(); const s2 = $('#evSearch'); s2.focus(); s2.setSelectionRange(pos, pos); };
      $$('[data-filter]', card).forEach((b) => (b.onclick = () => { ui.filter = b.dataset.filter; draw(); }));
      $$('[data-ev]', card).forEach((b) => (b.onclick = () => {
        const ev = cat[Number(b.dataset.ev)];
        if (!sameEvent(ev, a)) steps[ui.sel] = ev.kind === 'game' ? { kind: 'game', action: ev.action, params: defaultParams(ev) } : defaultAction(ev.kind);
        draw();
      }));
      $$('[data-gp]', card).forEach((inp) => (inp.oninput = () => { a.params = a.params || {}; a.params[inp.dataset.gp] = Number(inp.value); refreshChips(); }));
      $$('.pane-detail [data-f]', card).forEach((inp) => (inp.oninput = () => { a[inp.dataset.f] = inp.type === 'number' ? Number(inp.value) : inp.value; refreshChips(); }));
      if ($('#recBtn')) $('#recBtn').onclick = () => recordKey($('#recBtn'), (k) => { a.key = k; draw(); });
      $('#stepTest').onclick = () => testActions(r.name || 'Test', [a]);
      if ($('#stepRemove')) $('#stepRemove').onclick = () => { steps.splice(ui.sel, 1); ui.sel = Math.max(0, ui.sel - 1); draw(); };
    }

    $('#rSave').onclick = () => {
      if (!steps.length && !sound) return toast('Pick at least one thing that happens', 'var(--red)');
      if (steps.some((a) => a.kind === 'key' && !a.key)) return toast('One of your key steps has no key', 'var(--red)');
      if (steps.some((a) => a.kind === 'mod' && !String(a.command || '').trim())) return toast('The custom mod command is empty', 'var(--red)');
      if (sound && !sound.file) sound = null;
      r.actions = allActions();
      if (!r.name.trim()) {
        const w = whenParts(t).title.replace(/<[^>]+>/g, '');
        r.name = `${w} → ${steps.length ? eventFor(steps[0], r.gameId).label : 'sound'}`;
      }
      if (isNew) { r.id = uid(); D.rules.push(r); }
      else D.rules[D.rules.findIndex((x) => x.id === rule.id)] = r;
      persist(); closeModal(); renderRules(); renderGames(); renderActiveGame();
      if ($('#view-gifts').classList.contains('active')) renderGiftsView();
    };
    if ($('#rDelete')) $('#rDelete').onclick = () => {
      if (!confirm(`Delete the trigger "${rule.name}"?`)) return;
      D.rules = D.rules.filter((x) => x.id !== rule.id);
      persist(); closeModal(); renderRules(); renderGames(); renderActiveGame();
    };
  };
  // update the chips in the flow bar without redrawing (keeps the cursor in the box being typed in)
  const refreshChips = () => $$('.flow [data-sel]', card).forEach((b) => {
    const v = b.dataset.sel;
    if (v !== 'when' && v !== 'sound' && steps[Number(v)]) b.innerHTML = stepChip(steps[Number(v)], r.gameId, ui.sel === Number(v) ? 'on' : '');
  });
  draw();
  openModal();
}

// "Record" a key by pressing it in the app
const CODE_NAMES = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Control: 'Ctrl', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Shift: 'Shift', Alt: 'Alt', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };
function recordKey(btn, done) {
  btn.textContent = 'Press a key…'; btn.classList.add('recording');
  const onKey = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (['Control', 'Shift', 'Alt'].includes(e.key)) return; // wait for the real key (type Shift/Ctrl/Alt in the box to use them alone)
    let k = CODE_NAMES[e.key] || (/^Numpad\d$/.test(e.code) ? 'Num' + e.code.slice(6) : e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const mods = [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt'].filter(Boolean);
    cleanup();
    done([...mods, k].join('+'));
  };
  const onMouse = (e) => {
    if (e.target === btn) return;
    e.preventDefault(); e.stopPropagation(); cleanup();
    done(['MouseLeft', 'MouseMiddle', 'MouseRight'][e.button] || 'MouseLeft');
  };
  const cleanup = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', onMouse, true); };
  window.addEventListener('keydown', onKey, true);
  setTimeout(() => window.addEventListener('mousedown', onMouse, true), 50);
}

async function testActions(name, actions) {
  const delay = $('#tDelay')?.checked;
  const hasKeys = actions.some((a) => a.kind === 'key');
  if (hasKeys && delay) {
    toast('Click into your game — firing in 3 seconds…', '#ffb547');
    await new Promise((r) => setTimeout(r, 3000));
  }
  blum.testActions({ name, actions });
}

// ---------- modal ----------
function openModal() { $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modalCard').innerHTML = ''; $('#modalCard').classList.remove('wide'); closeGiftCombo(); }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || $('.recording')) return;
  if (!$('#picker').classList.contains('hidden')) return $('#picker').classList.add('hidden');
  if (!$('#modal').classList.contains('hidden')) closeModal();
});

// ---------- live feed ----------
const EV_ICON = { gift: '🎁', follow: '➕', like: '❤️', share: '↗️', chat: '💬', join: '👋' };
function evText(ev) {
  const n = `<b>${esc(ev.user?.nickname || ev.user?.uniqueId || 'someone')}</b>`;
  switch (ev.type) {
    case 'gift': return `${n} sent ${ev.gift.image ? `<img class="gmini" src="${esc(ev.gift.image)}" alt="">` : ''}${esc(ev.gift.name)}${ev.gift.count > 1 ? ` ×${ev.gift.count}` : ''} <span class="muted">(${(ev.gift.diamonds * ev.gift.count).toLocaleString()} <i class="coin"></i>)</span>`;
    case 'follow': return `${n} followed`;
    case 'like': return `${n} sent ${ev.likeCount} likes <span class="muted">· ${fmt(ev.totalLikes || 0)} total</span>`;
    case 'share': return `${n} shared the LIVE`;
    case 'chat': return `${n}: ${esc(ev.comment)}`;
    case 'join': return `${n} joined`;
  }
  return n;
}
function feedAdd(html, cls = '') {
  const feed = $('#feed');
  const empty = $('.empty-small', feed); if (empty) empty.remove();
  const el = document.createElement('div');
  el.className = 'ev ' + cls; el.innerHTML = html;
  feed.prepend(el);
  while (feed.children.length > 300) feed.lastChild.remove();
}
const timeStr = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
blum.on('event', ({ ev, fired }) => {
  if ((ev.type === 'like' || ev.type === 'join') && !fired.length && !$('#showLikes').checked) return;
  const av = ev.user?.avatar ? `<img class="av" src="${esc(ev.user.avatar)}">` : '<span class="av"></span>';
  feedAdd(`${av}<span class="ic">${EV_ICON[ev.type] || ''}</span><div class="tx">${evText(ev)}${fired.length ? `<div class="fired">${fired.map((f) => `<span>⚡ ${esc(f.name)}${f.times > 1 ? ' ×' + f.times : ''}</span>`).join('')}</div>` : ''}</div><span class="tm">${timeStr()}</span>`);
});
blum.on('log', ({ msg, level }) => feedAdd(`<span class="tx">${esc(msg)}</span><span class="tm">${timeStr()}</span>`, 'log ' + level));
blum.on('stats', (s) => {
  $('#sGifts').textContent = fmt(s.gifts); $('#sDiamonds').textContent = fmt(s.diamonds);
  $('#sLikes').textContent = fmt(s.likes); $('#sFollows').textContent = fmt(s.follows);
});
blum.on('mods', (list) => {
  const el = $('#modsInfo');
  el.textContent = list.length ? `🟢 ${list.map((m) => m.game).join(', ')}` : '0 mods connected';
  el.classList.toggle('on', list.length > 0);
});
function showFeed(f) {
  const el = $('#feedInfo');
  el.textContent = !f.on ? '' : f.clients ? `🟢 ${f.clients} game${f.clients === 1 ? '' : 's'} on the game feed` : `Game feed ready (port ${f.port})`;
  el.classList.toggle('on', f.on && f.clients > 0);
}
blum.on('feed', showFeed);
blum.on('queue', (n) => ($('#queueInfo').textContent = n ? `${n} action${n === 1 ? '' : 's'} queued` : ''));
blum.on('alert', (a) => toast(a.text, a.color));
blum.on('play-sound', ({ url, volume }) => { const au = new Audio(url); au.volume = Math.max(0, Math.min(1, volume)); au.play().catch(() => {}); });
blum.on('gift-list', (list) => { GIFTS = list; GIFTS_REAL = true; renderGiftList(); if ($('#view-gifts').classList.contains('active')) renderGiftsView(); });
blum.on('status', setStatus);

function renderGiftList() { /* the picture dropdown reads GIFTS directly */ }

// ---------- connect ----------
let connState = 'offline';
function setStatus({ state, text }) {
  connState = state;
  const p = $('#statusPill');
  p.className = 'pill ' + state; p.title = text;
  $('#statusText').textContent = text;
  const b = $('#connectBtn');
  const on = ['live', 'connecting', 'waiting'].includes(state);
  b.textContent = on ? 'Disconnect' : 'Go Live';
  b.classList.toggle('primary', !on);
}
$('#connectBtn').onclick = () => {
  if (['live', 'connecting', 'waiting'].includes(connState)) return blum.disconnect();
  const u = $('#username').value.trim().replace(/^@/, '');
  if (!u) { $('#username').focus(); return toast('Type your TikTok username first', 'var(--red)'); }
  D.settings.username = u; persist(); $('#setUsername').value = u;
  setTimeout(() => blum.connect(), 200); // let the save land first
};
$('#username').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#connectBtn').click(); });

// ---------- test panel ----------
const fakeUser = () => { const n = $('#tUser').value.trim() || 'test_viewer'; return { uniqueId: n, nickname: n, avatar: '' }; };
$('#tGiftBtn').onclick = () => {
  const name = $('#tGift').value.trim() || 'Rose';
  const known = findGift(name);
  simulate({ type: 'gift', user: fakeUser(), gift: { name: known?.name || name, image: known?.image || '', diamonds: known?.diamonds ?? 1, count: Math.max(1, Number($('#tGiftCount').value) || 1) } });
};
attachGiftCombo($('#tGift'), () => {});
$('#tGiftPick').onclick = () => openGiftPicker($('#tGift').value, (g) => { if (g) $('#tGift').value = g.name; });
$('#refreshGiftsBtn').onclick = async () => {
  const b = $('#refreshGiftsBtn'); b.disabled = true; b.textContent = 'Loading…';
  const r = await blum.refreshGifts();
  b.disabled = false; b.textContent = '⟳ Load from TikTok';
  if (r.ok) toast(`Loaded ${r.count} gifts from TikTok`, 'var(--green)');
  else toast(`Couldn't load gifts: ${r.error}`, 'var(--red)');
};
$('#tFollowBtn').onclick = () => simulate({ type: 'follow', user: { ...fakeUser(), uniqueId: fakeUser().uniqueId + '_' + uid().slice(0, 4) } });
$('#tShareBtn').onclick = () => simulate({ type: 'share', user: fakeUser() });
$('#tLike10Btn').onclick = () => simulate({ type: 'like', user: fakeUser(), likeCount: 10 });
$('#tLike100Btn').onclick = () => simulate({ type: 'like', user: fakeUser(), likeCount: 100 });
$('#tJoinBtn').onclick = () => simulate({ type: 'join', user: fakeUser() });
$('#tChatBtn').onclick = () => simulate({ type: 'chat', user: fakeUser(), comment: $('#tChat').value });
$('#tChat').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#tChatBtn').click(); });
async function simulate(ev) {
  if ($('#tDelay').checked) { toast('Firing in 3 seconds — click into your game', '#ffb547'); await new Promise((r) => setTimeout(r, 3000)); }
  blum.simulate(ev);
}
$('#clearQueueBtn').onclick = () => { blum.clearQueue(); toast('Stopped queued actions'); };
$('#resetSessionBtn').onclick = () => { blum.resetSession(); toast('Counters reset'); };

// ---------- settings ----------
function renderSettings() {
  const s = D.settings;
  $('#setUsername').value = s.username || '';
  $('#username').value = s.username || '';
  $('#setSignKey').value = s.signApiKey || '';
  $('#setAutoReconnect').checked = !!s.autoReconnect;
  $('#setDedupe').checked = !!s.dedupeFollows;
  $('#setKeyGap').value = s.keyGapMs;
  $('#setPort').value = s.port;
  $('#setFeedOn').checked = !!s.feedOn;
  $('#setFeedPort').value = s.feedPort;
  $('#modUrl').textContent = `ws://127.0.0.1:${s.port}/mods`;
  $('#overlayUrl').textContent = `http://127.0.0.1:${s.port}/overlay`;
}
const bindSetting = (id, key, conv = (v) => v, prop = 'value') => $(id).addEventListener('change', (e) => { D.settings[key] = conv(e.target[prop]); persist(); renderSettings(); });
bindSetting('#setUsername', 'username', (v) => v.trim().replace(/^@/, ''));
bindSetting('#setSignKey', 'signApiKey', (v) => v.trim());
bindSetting('#setAutoReconnect', 'autoReconnect', Boolean, 'checked');
bindSetting('#setDedupe', 'dedupeFollows', Boolean, 'checked');
bindSetting('#setKeyGap', 'keyGapMs', (v) => Math.max(0, Number(v) || 0));
bindSetting('#setFeedOn', 'feedOn', Boolean, 'checked');
bindSetting('#setFeedPort', 'feedPort', (v) => Math.min(65535, Math.max(1024, Number(v) || 21213)));
bindSetting('#setPort', 'port', (v) => Math.min(65535, Math.max(1024, Number(v) || 21777)));
$('#copyOverlay').onclick = () => { navigator.clipboard.writeText($('#overlayUrl').textContent); toast('Overlay link copied'); };
$('#exportBtn').onclick = async () => { if (await blum.exportData()) toast('Backup saved'); };
$('#importBtn').onclick = async () => { const d = await blum.importData(); if (d) { D = d; renderAll(); toast('Backup restored'); } };
document.addEventListener('click', (e) => { const a = e.target.closest('[data-url]'); if (a) { e.preventDefault(); blum.openUrl(a.dataset.url); } });

// ---------- update banner ----------
let updateDismissed = '';
function showUpdate(u) {
  const bar = $('#updateBar');
  bar.classList.remove('busy', 'err');
  if (u.state === 'available') {
    if (updateDismissed === u.version) return;
    $('#upTitle').textContent = `Update v${u.version} available`;
    $('#upSub').textContent = (u.notes || '').split('\n')[0] || 'Click to download and restart.';
    $('#upGo').textContent = 'Update now'; $('#upGo').style.display = '';
    $('#upLater').onclick = () => { updateDismissed = u.version; bar.classList.remove('show'); };
    bar.classList.add('show');
  } else if (u.state === 'downloading') {
    $('#upTitle').textContent = `Downloading v${u.version}…`; $('#upSub').textContent = `${u.pct || 0}%`;
    $('#upFill').style.width = (u.pct || 0) + '%';
    bar.classList.add('show', 'busy');
  } else if (u.state === 'restarting') {
    $('#upTitle').textContent = `Installing v${u.version}`; $('#upSub').textContent = 'BlumMods will restart in a moment…';
    $('#upFill').style.width = '100%';
    bar.classList.add('show', 'busy');
  } else if (u.state === 'error') {
    $('#upTitle').textContent = 'Update problem'; $('#upSub').textContent = u.text || '';
    $('#upGo').textContent = 'Try again'; $('#upGo').style.display = u.version ? '' : 'none';
    $('#upLater').onclick = () => bar.classList.remove('show');
    bar.classList.add('show', 'err');
  } else if (u.state === 'none' && u.manual) { bar.classList.remove('show'); toast(u.text); }
}
$('#upGo').onclick = () => blum.updateInstall();
$('#checkUpdateBtn').onclick = () => { updateDismissed = ''; blum.updateCheck(); };
blum.on('update', showUpdate);

// ---------- boot ----------
function renderAll() { renderGames(); renderActiveGame(); renderSettings(); if ($('#view-rules').classList.contains('active')) renderRules(); }
(async () => {
  const init = await blum.init();
  D = init.data; KEYS = init.keyChoices;
  if (init.gifts?.length) { GIFTS = init.gifts; GIFTS_REAL = true; }
  if (init.manifest?.games) MANIFEST = init.manifest;
  $('#keyList').innerHTML = KEYS.map((k) => `<option value="${k}">`).join('');
  $('#dataFolderBtn').onclick = () => blum.openFolder(init.userData);
  $('#versionInfo').textContent = `BlumMods v${init.version} — your games, triggers and settings are saved automatically.`;
  renderGiftList();
  await refreshMods();
  renderAll();
  setStatus(init.status);
  showFeed(init.feed);
  if (init.update?.state && init.update.state !== 'idle') showUpdate(init.update);
  if (init.mods.length) $('#modsInfo').textContent = `🟢 ${init.mods.map((m) => m.game).join(', ')}`;
})();
