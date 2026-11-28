// Turns raw tiktok-live-connector messages into BlumMods events.
// The library (2.5, "tiktok-live-proto/v3") changed field names; older versions used other ones. Both are read here,
// so a library update can't silently break triggers again (2026-11-27: likes counted 1 per message, gifts had no name,
// follows had no username). Pure functions, tested in test/tiktok-events.test.js.

const first = (...v) => v.find((x) => x !== undefined && x !== null && x !== '');

function userOf(u) {
  u = u || {};
  return {
    uniqueId: String(first(u.uniqueId, u.displayId, '') || ''),
    nickname: String(first(u.nickname, u.uniqueId, u.displayId, '') || ''),
    userId: String(first(u.userId, u.id, '') || ''),
    avatar: first(u.profilePicture?.url?.[0], u.profilePictureUrl, u.avatarThumb?.urlList?.[0], u.avatarLarge?.urlList?.[0], '') || '',
  };
}

// Returns a gift event for the whole message (count = repeatCount), or null while a streak (combo) is still going.
// Live code uses GiftStreaks below instead, which fires as the streak counts up.
function giftEvent(d, catalog = [], { wholeStreak = false } = {}) {
  const g = d.gift || {};
  const old = d.giftDetails || {};
  const id = first(d.giftId, g.id, '');
  const known = catalog.find((x) => String(x.id) === String(id));
  const type = Number(first(g.type, old.giftType, 0));
  const streakable = type === 1 || g.combo === true;
  if (streakable && !wholeStreak && !Number(d.repeatEnd)) return null;
  return {
    type: 'gift',
    user: userOf(d.user),
    gift: {
      id,
      giftType: type,
      name: String(first(g.name, old.giftName, d.extendedGiftInfo?.name, known?.name, `Gift ${id}`)),
      diamonds: Number(first(g.diamondCount, old.diamondCount, d.extendedGiftInfo?.diamond_count, known?.diamonds, 0)) || 0,
      count: Math.max(1, Number(first(d.repeatCount, d.comboCount, 1)) || 1),
      image: first(g.image?.urlList?.[0], old.giftImage?.url?.[0], known?.image, '') || '',
    },
  };
}

// Streaks (combos): TikTok sends a message for every step of the count (x1, x2, x3 ... then an end message).
// Waiting for the end made a 30-Rose combo land all at once, after the viewer stopped, and a streak whose end
// message never came did nothing at all (Carter, 2026-11-28). This fires each step as it arrives, with count =
// the new gifts since the last step, so every gift does something while it is being sent.
const isStreakable = (d) => { const t = Number(first(d.gift?.type, d.giftDetails?.giftType, 0)); return t === 1 || d.gift?.combo === true; };
class GiftStreaks {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.seen = new Map(); }
  event(d, catalog = []) {
    if (!isStreakable(d)) return giftEvent(d, catalog);
    const ev = giftEvent(d, catalog, { wholeStreak: true });
    const u = ev.user;
    const key = [u.userId || u.uniqueId, ev.gift.id, d.groupId || ''].join('|');
    const t = this.now();
    for (const [k, v] of this.seen) if (t - v.at > 120000) this.seen.delete(k); // streaks that never ended
    const n = ev.gift.count;
    let before = this.seen.get(key)?.count || 0;
    if (n < before) before = 0; // a new streak started without the old one ending
    if (Number(d.repeatEnd)) this.seen.delete(key); else this.seen.set(key, { count: n, at: t });
    const fresh = n - before;
    if (fresh <= 0) return null; // the end message repeats the last count
    ev.gift.count = fresh;
    return ev;
  }
}

function likeEvent(d) {
  return {
    type: 'like',
    user: userOf(d.user),
    likeCount: Math.max(1, Number(first(d.count, d.likeCount, 1)) || 1),
    totalLikes: Number(first(d.total, d.totalLikeCount, 0)) || 0,
  };
}

const simpleEvent = (type, d) => ({ type, user: userOf(d.user) });
const chatEvent = (d) => ({ type: 'chat', user: userOf(d.user), comment: String(first(d.comment, d.content, '') || '') });

module.exports = { userOf, giftEvent, GiftStreaks, likeEvent, simpleEvent, chatEvent };
