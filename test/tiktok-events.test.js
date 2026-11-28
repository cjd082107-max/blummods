// Raw TikTok messages (current library format and the old one) -> BlumMods events -> which triggers fire.
// Guards against triggers silently miscounting when the library renames fields (2026-11-27).
const assert = require('assert');
const { giftEvent, likeEvent, simpleEvent, chatEvent } = require('../src/tiktok-events');
const { RuleEngine } = require('../src/rules');

const user = (h) => ({ id: '7000' + h.length, displayId: h, nickname: h.toUpperCase(), avatarThumb: { urlList: ['https://x/a.webp'] } });
const catalog = [{ id: 5655, name: 'Rose', diamonds: 1, image: 'https://x/rose.png' }];

// ---- users (current format) ----
assert.strictEqual(simpleEvent('follow', { user: user('bob') }).user.uniqueId, 'bob');
assert.strictEqual(simpleEvent('join', { user: user('bob') }).user.nickname, 'BOB');
// old format still works
assert.strictEqual(simpleEvent('follow', { user: { uniqueId: 'old', nickname: 'Old' } }).user.uniqueId, 'old');

// ---- gifts ----
const rose = (n, end) => ({ giftId: '5655', repeatCount: n, repeatEnd: end ? 1 : 0, user: user('ann'), gift: { id: '5655', name: 'Rose', diamondCount: 1, type: 1, combo: true, image: { urlList: ['https://x/r.webp'] } } });
assert.strictEqual(giftEvent(rose(1, false)), null, 'streak in progress is ignored');
assert.strictEqual(giftEvent(rose(4, false)), null);
const roseEnd = giftEvent(rose(5, true));
assert.deepStrictEqual([roseEnd.gift.name, roseEnd.gift.diamonds, roseEnd.gift.count, roseEnd.user.uniqueId], ['Rose', 1, 5, 'ann']);
const galaxy = giftEvent({ giftId: '11046', repeatCount: 1, repeatEnd: 0, user: user('gal'), gift: { id: '11046', name: 'Galaxy', diamondCount: 1000, type: 2 } });
assert.deepStrictEqual([galaxy.gift.name, galaxy.gift.diamonds, galaxy.gift.count], ['Galaxy', 1000, 1], 'non-streak gifts fire at once');
// old format
const oldGift = giftEvent({ giftId: 5655, repeatCount: 3, repeatEnd: 1, user: { uniqueId: 'o' }, giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 1 } });
assert.deepStrictEqual([oldGift.gift.name, oldGift.gift.count], ['Rose', 3]);
// name missing everywhere: falls back to the gift catalog by id
assert.strictEqual(giftEvent({ giftId: '5655', repeatCount: 1, repeatEnd: 1, user: user('c'), gift: { id: '5655', type: 2 } }, catalog).gift.name, 'Rose');

// ---- likes: batches of taps ----
assert.strictEqual(likeEvent({ count: 15, total: '120', user: user('t') }).likeCount, 15);
assert.strictEqual(likeEvent({ likeCount: 7, user: { uniqueId: 'o' } }).likeCount, 7, 'old format');

// ---- chat ----
assert.strictEqual(chatEvent({ content: '!jump now', user: user('c') }).comment, '!jump now');
assert.strictEqual(chatEvent({ comment: '!jump', user: { uniqueId: 'o' } }).comment, '!jump', 'old format');

// ---- end to end through the trigger rules ----
const R = (id, trigger, x = {}) => ({ id, name: id, enabled: true, trigger, actions: [], ...x });
const rules = [
  R('jail100', { type: 'like', likeEvery: 100 }),
  R('roseEach', { type: 'gift', giftName: 'Rose' }, { repeatPerGift: true }),
  R('galaxy', { type: 'gift', giftName: 'Galaxy' }),
  R('follow', { type: 'follow' }),
  R('jump', { type: 'chat', command: '!jump' }),
];
const e = new RuleEngine();
const fired = (ev) => e.match(ev, rules).map((f) => `${f.rule.id}x${f.times}`).join(',');
// 100 likes arriving as batches of 15 taps: fires exactly once, at the 100th
let out = [];
for (let i = 0; i < 6; i++) out.push(fired(likeEvent({ count: 15, user: user('t') })));
assert.deepStrictEqual(out, ['', '', '', '', '', ''], '90 likes: nothing yet');
assert.strictEqual(fired(likeEvent({ count: 15, user: user('t') })), 'jail100x1', '105 likes: jail once');
assert.strictEqual(fired(likeEvent({ count: 15, user: user('t') })), '', '120 likes: not again');
// a 5-Rose streak: the in-progress messages are dropped, the end fires 5 times (once per Rose)
for (let n = 1; n < 5; n++) assert.strictEqual(giftEvent(rose(n, false)), null);
assert.strictEqual(fired(giftEvent(rose(5, true))), 'roseEachx5');
assert.strictEqual(fired(galaxy), 'galaxyx1');
// follow / unfollow / follow spam by one person counts once
assert.strictEqual(fired(simpleEvent('follow', { user: user('spam') })), 'followx1');
assert.strictEqual(fired(simpleEvent('follow', { user: user('spam') })), '');
assert.strictEqual(fired(simpleEvent('follow', { user: user('other') })), 'followx1');
assert.strictEqual(fired(chatEvent({ content: '!jump', user: user('c') })), 'jumpx1');

console.log('tiktok-events: all passed');
