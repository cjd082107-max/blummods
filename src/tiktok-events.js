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

// Returns a gift event, or null while a streak (combo) is still going: the streak's end message carries the total.
function giftEvent(d, catalog = []) {
  const g = d.gift || {};
  const old = d.giftDetails || {};
  const id = first(d.giftId, g.id, '');
  const known = catalog.find((x) => String(x.id) === String(id));
  const type = Number(first(g.type, old.giftType, 0));
  const streakable = type === 1 || g.combo === true;
  if (streakable && !Number(d.repeatEnd)) return null;
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

module.exports = { userOf, giftEvent, likeEvent, simpleEvent, chatEvent };
