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
    onPick: (g) => openRuleModal(null, { name: `${g.name} = `, trigger: { type: 'gift', giftName: g.name, minDiamonds: 0, likeEvery: 100, command: '!jump' } }),
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
const ACTIONS = {
  key: 'Press key',
  mod: 'Mod command',
  alert: 'Show alert',
  sound: 'Play sound',
  wait: 'Wait',
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
          ${g.bepinex ? '<span class="badge bep">BepInEx ✓</span>' : ''}
          <span class="badge">${ruleCount} trigger${ruleCount === 1 ? '' : 's'}</span>
        </div>
        <div class="game-actions">
          <button class="btn primary small" data-a="launch">▶ Launch</button>
          <button class="btn small" data-a="rules" title="Edit this game's triggers">⚡</button>
          <button class="btn small" data-a="edit" title="Edit game">✎</button>
        </div>
      </div>`;
    if (active) card.querySelector('.cover').insertAdjacentHTML('beforeend', '<span class="tag">ACTIVE</span>');
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
        <div>${isNew ? '' : '<button class="btn danger" id="gDelete">Remove game</button>'}</div>
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
      if (isNew) toast(`${draft.name} added`);
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

function triggerText(t) {
  switch (t.type) {
    case 'gift': return `${t.giftName ? esc(t.giftName) : 'Any gift'}${t.minDiamonds ? ` (${t.minDiamonds}+ 💎)` : ''}`;
    case 'follow': return 'Someone follows';
    case 'like': return `Every ${t.likeEvery || 100} likes`;
    case 'share': return 'Someone shares';
    case 'chat': return t.command ? `Chat says “${esc(t.command)}”` : 'Any chat message';
    case 'join': return 'Someone joins';
  }
  return '?';
}
function actionText(a) {
  switch (a.kind) {
    case 'key': return `press ${esc(a.key || '?')}${Number(a.repeat) > 1 ? ` ×${a.repeat}` : ''}`;
    case 'mod': return `mod: ${esc(a.command || '?')}`;
    case 'alert': return `alert “${esc(a.text || '')}”`;
    case 'sound': return `sound ${esc((a.file || '').split(/[\\/]/).pop() || '?')}`;
    case 'wait': return `wait ${a.ms || 500}ms`;
  }
  return '?';
}

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
  list.innerHTML = '';
  for (const r of rules) {
    const g = D.games.find((x) => x.id === r.gameId);
    const el = document.createElement('div');
    el.className = 'rule' + (r.enabled ? '' : ' off');
    el.innerHTML = `
      <label class="switch"><input type="checkbox" ${r.enabled ? 'checked' : ''}><span></span></label>
      <div class="rule-icon">${TRIGGERS[r.trigger.type]?.e || '?'}</div>
      <div class="rule-main">
        <div class="rule-name">${esc(r.name)}<span class="scope">${g ? esc(g.name) : 'All games'}</span></div>
        <div class="rule-desc">${triggerText(r.trigger)}<span class="arrow">→</span>${(r.actions || []).map(actionText).join(', ') || '<i>no actions</i>'}${r.cooldownSec ? ` · ${r.cooldownSec}s cooldown` : ''}</div>
      </div>
      <button class="btn small" data-a="test">Test</button>
      <button class="btn small ghost" data-a="dup" title="Duplicate">⧉</button>
      <button class="btn small" data-a="edit">Edit</button>`;
    el.querySelector('input').onchange = (e) => { r.enabled = e.target.checked; persist(); renderRules(); renderActiveGame(); };
    el.querySelector('[data-a=edit]').onclick = () => openRuleModal(r);
    el.querySelector('[data-a=test]').onclick = () => testActions(r.name, r.actions);
    el.querySelector('[data-a=dup]').onclick = () => { D.rules.splice(D.rules.indexOf(r) + 1, 0, { ...structuredClone(r), id: uid(), name: r.name + ' (copy)' }); persist(); renderRules(); };
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

function defaultAction(kind) {
  return {
    key: { kind, key: 'Space', holdMs: 80, repeat: 1 },
    mod: { kind, command: '', args: '' },
    alert: { kind, text: '{nickname} sent {gift}!', color: '#25f4ee', seconds: 4 },
    sound: { kind, file: '', volume: 80 },
    wait: { kind, ms: 500 },
  }[kind];
}

function openRuleModal(rule, preset) {
  const isNew = !rule;
  const r = structuredClone(rule || { ...newRule(), ...(preset || {}) });
  const card = $('#modalCard');

  const actionFields = (a, i) => {
    switch (a.kind) {
      case 'key': return `
        <input data-f="key" value="${esc(a.key)}" list="keyList" style="width:110px" placeholder="key">
        <button class="btn small" data-rec="${i}">Record</button>
        <span class="lbl">hold</span><input data-f="holdMs" type="number" min="20" value="${a.holdMs}" style="width:64px"><span class="lbl">ms</span>
        <span class="lbl">×</span><input data-f="repeat" type="number" min="1" max="50" value="${a.repeat}" style="width:60px">`;
      case 'mod': return `
        <input data-f="command" value="${esc(a.command)}" placeholder="command, e.g. spawn_enemy" style="flex:1;min-width:160px">
        <input data-f="args" value="${esc(a.args)}" placeholder="extra info, e.g. {nickname}" style="flex:1;min-width:140px">`;
      case 'alert': return `
        <input data-f="text" value="${esc(a.text)}" style="flex:1;min-width:200px">
        <input data-f="color" type="color" value="${esc(a.color)}" style="width:44px;padding:2px;height:34px">
        <input data-f="seconds" type="number" min="1" value="${a.seconds}" style="width:60px"><span class="lbl">sec</span>`;
      case 'sound': return `
        <button class="btn small" data-pick="${i}">${a.file ? 'Change' : 'Choose sound'}</button>
        <span class="lbl" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((a.file || 'no file').split(/[\\/]/).pop())}</span>
        <span class="lbl">vol</span><input data-f="volume" type="range" min="0" max="100" value="${a.volume}" style="width:90px;padding:0">`;
      case 'wait': return `<input data-f="ms" type="number" min="0" value="${a.ms}" style="width:90px"><span class="lbl">ms before the next action</span>`;
    }
    return '';
  };

  const draw = () => {
    const t = r.trigger;
    card.innerHTML = `
      <h2>${isNew ? 'New trigger' : 'Edit trigger'}</h2>
      <div class="grid2">
        <div class="field"><label>Name</label><input id="rName" value="${esc(r.name)}" placeholder="e.g. Rose = jump"></div>
        <div class="field"><label>Works in</label><select id="rScope">${scopeOptions(r.gameId || '')}</select></div>
      </div>
      <div class="section-title">When this happens</div>
      <div class="trigger-types">${Object.entries(TRIGGERS).map(([k, v]) => `<div class="ttype ${t.type === k ? 'sel' : ''}" data-t="${k}"><span class="e">${v.e}</span>${v.label}</div>`).join('')}</div>
      ${t.type === 'gift' ? `
        <div class="grid2">
          <div class="field"><label>Which gift</label><div class="gift-field">${giftImg(findGift(t.giftName))}<input id="tGiftName" list="giftList" value="${esc(t.giftName)}" placeholder="leave empty for any gift"><button class="btn small" id="tGiftBrowse">Browse</button></div></div>
          <div class="field"><label>Only if worth at least (💎 per gift)</label><input id="tMin" type="number" min="0" value="${t.minDiamonds || 0}"></div>
        </div>
        <label class="chk"><input type="checkbox" id="tRepeat" ${r.repeatPerGift ? 'checked' : ''}> Run once for each gift in a combo (x5 roses = 5 times, max 20)</label>` : ''}
      ${t.type === 'like' ? `<div class="field"><label>Every how many likes</label><input id="tLikes" type="number" min="1" value="${t.likeEvery || 100}" class="w-num"></div>` : ''}
      ${t.type === 'chat' ? `<div class="field"><label>Chat command</label><input id="tCmd" value="${esc(t.command)}" placeholder="!jump  (empty = every message)"><p class="hint">Anything typed after the command is available as <code>{args}</code>.</p></div>` : ''}
      ${t.type === 'follow' ? '<p class="hint">Fires when someone follows you during the LIVE.</p>' : ''}
      ${t.type === 'share' ? '<p class="hint">Fires when someone shares your LIVE.</p>' : ''}
      ${t.type === 'join' ? '<p class="hint">Fires every time a viewer enters. On busy streams this can be a lot — add a cooldown.</p>' : ''}
      <div class="field" style="margin-top:6px"><label>Cooldown (seconds) <span class="muted">— ignore repeats for this long</span></label><input id="rCd" type="number" min="0" value="${r.cooldownSec || 0}" class="w-num"></div>

      <div class="section-title">Do this <span class="add-actions">${Object.entries(ACTIONS).map(([k, v]) => `<button class="btn small" data-add="${k}">+ ${v}</button>`).join('')}</span></div>
      <div class="actions">${r.actions.map((a, i) => `
        <div class="action" data-i="${i}">
          <span class="num">${i + 1}</span>
          <select class="kind" data-kind="${i}">${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <div class="fields">${actionFields(a, i)}</div>
          <button class="btn small ghost" data-up="${i}" title="Move up">↑</button>
          <button class="btn small ghost" data-del="${i}" title="Remove">✕</button>
        </div>`).join('') || '<div class="empty-small">Add at least one action above.</div>'}
      </div>
      <p class="hint">Use <code>{nickname}</code> <code>{user}</code> <code>{gift}</code> <code>{count}</code> <code>{diamonds}</code> <code>{comment}</code> <code>{args}</code> <code>{likes}</code> in text.</p>
      <div class="modal-foot">
        <div class="row">${isNew ? '' : '<button class="btn danger" id="rDelete">Delete</button>'}<button class="btn" id="rTest">Test it</button></div>
        <div class="row"><button class="btn" id="rCancel">Cancel</button><button class="btn primary" id="rSave">Save trigger</button></div>
      </div>`;

    $('#rName').oninput = (e) => (r.name = e.target.value);
    $('#rScope').onchange = (e) => (r.gameId = e.target.value || null);
    $('#rCd').oninput = (e) => (r.cooldownSec = Number(e.target.value) || 0);
    $$('.ttype', card).forEach((el) => (el.onclick = () => { t.type = el.dataset.t; draw(); }));
    if ($('#tGiftName')) {
      $('#tGiftName').oninput = (e) => (t.giftName = e.target.value);
      $('#tGiftName').onchange = () => draw();
      $('#tGiftBrowse').onclick = () => openGiftPicker(t.giftName, (g) => { t.giftName = g ? g.name : ''; draw(); });
      $('#tMin').oninput = (e) => (t.minDiamonds = Number(e.target.value) || 0);
      $('#tRepeat').onchange = (e) => (r.repeatPerGift = e.target.checked);
    }
    if ($('#tLikes')) $('#tLikes').oninput = (e) => (t.likeEvery = Number(e.target.value) || 100);
    if ($('#tCmd')) $('#tCmd').oninput = (e) => (t.command = e.target.value);

    $$('[data-add]', card).forEach((b) => (b.onclick = () => { r.actions.push(defaultAction(b.dataset.add)); draw(); }));
    $$('[data-del]', card).forEach((b) => (b.onclick = () => { r.actions.splice(Number(b.dataset.del), 1); draw(); }));
    $$('[data-up]', card).forEach((b) => (b.onclick = () => { const i = Number(b.dataset.up); if (i > 0) { [r.actions[i - 1], r.actions[i]] = [r.actions[i], r.actions[i - 1]]; draw(); } }));
    $$('[data-kind]', card).forEach((s) => (s.onchange = () => { r.actions[Number(s.dataset.kind)] = defaultAction(s.value); draw(); }));
    $$('.action', card).forEach((row) => {
      const a = r.actions[Number(row.dataset.i)];
      $$('[data-f]', row).forEach((inp) => (inp.oninput = () => {
        a[inp.dataset.f] = inp.type === 'number' || inp.type === 'range' ? Number(inp.value) : inp.value;
      }));
    });
    $$('[data-pick]', card).forEach((b) => (b.onclick = async () => { const f = await blum.pickSound(); if (f) { r.actions[Number(b.dataset.pick)].file = f; draw(); } }));
    $$('[data-rec]', card).forEach((b) => (b.onclick = () => recordKey(b, (k) => { r.actions[Number(b.dataset.rec)].key = k; draw(); })));

    $('#rCancel').onclick = closeModal;
    $('#rTest').onclick = () => testActions(r.name || 'Test', r.actions);
    $('#rSave').onclick = () => {
      if (!r.actions.length) return toast('Add at least one action', 'var(--red)');
      const bad = r.actions.find((a) => a.kind === 'key' && !a.key);
      if (bad) return toast('One of your key actions has no key', 'var(--red)');
      if (!r.name.trim()) r.name = `${TRIGGERS[t.type].label}${t.type === 'gift' && t.giftName ? ': ' + t.giftName : ''}`;
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
function closeModal() { $('#modal').classList.add('hidden'); $('#modalCard').innerHTML = ''; }
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
    case 'gift': return `${n} sent ${ev.gift.image ? `<img class="gmini" src="${esc(ev.gift.image)}" alt="">` : ''}${esc(ev.gift.name)}${ev.gift.count > 1 ? ` ×${ev.gift.count}` : ''} <span class="muted">(${ev.gift.diamonds * ev.gift.count} 💎)</span>`;
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
blum.on('queue', (n) => ($('#queueInfo').textContent = n ? `${n} action${n === 1 ? '' : 's'} queued` : ''));
blum.on('alert', (a) => toast(a.text, a.color));
blum.on('play-sound', ({ url, volume }) => { const au = new Audio(url); au.volume = Math.max(0, Math.min(1, volume)); au.play().catch(() => {}); });
blum.on('gift-list', (list) => { GIFTS = list; GIFTS_REAL = true; renderGiftList(); if ($('#view-gifts').classList.contains('active')) renderGiftsView(); });
blum.on('status', setStatus);

function renderGiftList() {
  $('#giftList').innerHTML = GIFTS.slice().sort((a, b) => a.diamonds - b.diamonds).map((g) => `<option value="${esc(g.name)}">${g.diamonds} 💎</option>`).join('');
}

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
  $('#modUrl').textContent = `ws://127.0.0.1:${s.port}/mods`;
  $('#overlayUrl').textContent = `http://127.0.0.1:${s.port}/overlay`;
}
const bindSetting = (id, key, conv = (v) => v, prop = 'value') => $(id).addEventListener('change', (e) => { D.settings[key] = conv(e.target[prop]); persist(); renderSettings(); });
bindSetting('#setUsername', 'username', (v) => v.trim().replace(/^@/, ''));
bindSetting('#setSignKey', 'signApiKey', (v) => v.trim());
bindSetting('#setAutoReconnect', 'autoReconnect', Boolean, 'checked');
bindSetting('#setDedupe', 'dedupeFollows', Boolean, 'checked');
bindSetting('#setKeyGap', 'keyGapMs', (v) => Math.max(0, Number(v) || 0));
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
  $('#keyList').innerHTML = KEYS.map((k) => `<option value="${k}">`).join('');
  $('#dataFolderBtn').onclick = () => blum.openFolder(init.userData);
  $('#versionInfo').textContent = `BlumMods v${init.version} — your games, triggers and settings are saved automatically.`;
  renderGiftList();
  renderAll();
  setStatus(init.status);
  if (init.update?.state && init.update.state !== 'idle') showUpdate(init.update);
  if (init.mods.length) $('#modsInfo').textContent = `🟢 ${init.mods.map((m) => m.game).join(', ')}`;
})();
