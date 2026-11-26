// Turns a BlumMods event into the message TikFinity's local Event API sends
// (ws://127.0.0.1:21213), so games with built-in TikFinity support react to BlumMods directly.
function fakeId(name) {
  let h = 7n;
  for (const ch of String(name || 'viewer')) h = (h * 31n + BigInt(ch.codePointAt(0))) % 9000000000000000000n;
  return String(1000000000000000000n + h);
}
function toTikFinity(ev) {
  const u = ev.user || {};
  const base = {
    uniqueId: u.uniqueId || 'viewer', nickname: u.nickname || u.uniqueId || 'viewer',
    userId: String(u.userId || fakeId(u.uniqueId)), profilePictureUrl: u.avatar || '',
  };
  switch (ev.type) {
    case 'gift': {
      const g = ev.gift || {};
      return { event: 'gift', data: {
        ...base, giftId: Number(g.id) || 0, giftName: g.name || '', diamondCount: Number(g.diamonds) || 0,
        repeatCount: Number(g.count) || 1, repeatEnd: true, giftType: Number(g.giftType) || 1,
        describe: `Sent ${g.name || 'a gift'}`, giftPictureUrl: g.image || '',
      } };
    }
    case 'like': return { event: 'like', data: { ...base, likeCount: Number(ev.likeCount) || 1, totalLikeCount: Number(ev.totalLikes) || 0 } };
    case 'follow': return { event: 'follow', data: { ...base, displayType: 'pm_main_follow_message_viewer_2', label: '{0:user} followed the host' } };
    case 'share': return { event: 'share', data: { ...base, displayType: 'pm_mt_guidance_share', label: '{0:user} shared the LIVE' } };
    case 'chat': return { event: 'chat', data: { ...base, comment: ev.comment || '' } };
    case 'join': return { event: 'member', data: { ...base, actionId: 1, label: '{0:user} joined' } };
  }
  return null;
}
module.exports = { toTikFinity };
