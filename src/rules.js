// BlumMods rule engine — decides which rules fire for a TikTok Live event.
// Pure logic (no Electron), so it can be tested on its own.

const MAX_REPEAT_PER_GIFT = 20; // safety cap for "run once per gift in a combo"
const MAX_LIKE_FIRES = 5;       // safety cap when a huge like burst crosses many milestones

function fillTemplate(text, ev) {
  if (!text) return '';
  const vars = {
    user: ev.user?.uniqueId || '',
    nickname: ev.user?.nickname || ev.user?.uniqueId || '',
    gift: ev.gift?.name || '',
    count: String(ev.gift?.count ?? ev.likeCount ?? 1),
    coins: String(ev.gift ? ev.gift.diamonds * ev.gift.count : 0),
    diamonds: String(ev.gift ? ev.gift.diamonds * ev.gift.count : 0), // old name for {coins}
    comment: ev.comment || '',
    args: ev.args || '',
    likes: String(ev.totalLikes ?? ''),
  };
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

class RuleEngine {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.reset();
  }

  // Called when a new live session starts (connect) or the user hits "reset".
  reset() {
    this.likeTotal = 0;
    this.likeMarks = {};     // ruleId -> milestones already fired
    this.lastFired = {};     // ruleId -> timestamp
    this.followed = new Set();
  }

  // Returns [{ rule, times, ev }] for every rule that should run.
  match(ev, rules, { dedupeFollows = true } = {}) {
    const out = [];

    if (ev.type === 'like') {
      this.likeTotal += ev.likeCount || 0;
      ev.totalLikes = this.likeTotal;
    }
    if (ev.type === 'follow' && dedupeFollows) {
      const id = ev.user?.uniqueId;
      if (id && this.followed.has(id)) return out; // follow/unfollow spam
      if (id) this.followed.add(id);
    }

    for (const rule of rules) {
      if (!rule.enabled) continue;
      const t = rule.trigger || {};
      if (t.type !== ev.type) continue;
      let times = 1;
      let evForRule = ev;

      if (ev.type === 'gift') {
        const want = (t.giftName || '').trim().toLowerCase();
        if (want && want !== 'any' && want !== (ev.gift.name || '').toLowerCase()) continue;
        if (t.minDiamonds && ev.gift.diamonds < Number(t.minDiamonds)) continue;
        if (rule.repeatPerGift) times = Math.min(ev.gift.count || 1, MAX_REPEAT_PER_GIFT);
      } else if (ev.type === 'like') {
        const every = Math.max(1, Number(t.likeEvery) || 100);
        const reached = Math.floor(this.likeTotal / every);
        const prev = this.likeMarks[rule.id] || 0;
        if (reached <= prev) continue;
        this.likeMarks[rule.id] = reached;
        times = Math.min(reached - prev, MAX_LIKE_FIRES);
      } else if (ev.type === 'chat') {
        const cmd = (t.command || '').trim().toLowerCase();
        const msg = (ev.comment || '').trim();
        if (cmd) {
          const low = msg.toLowerCase();
          if (!(low === cmd || low.startsWith(cmd + ' '))) continue;
          evForRule = { ...ev, args: msg.slice(cmd.length).trim() };
        }
      }

      const cd = (Number(rule.cooldownSec) || 0) * 1000;
      const now = this.now();
      if (cd && this.lastFired[rule.id] !== undefined && now - this.lastFired[rule.id] < cd) continue;
      this.lastFired[rule.id] = now;

      out.push({ rule, times, ev: evForRule });
    }
    return out;
  }
}

module.exports = { RuleEngine, fillTemplate };
