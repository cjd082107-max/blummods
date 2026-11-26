const assert = require('assert');
const { RuleEngine, fillTemplate } = require('../src/rules');
let t = 0; const e = new RuleEngine({ now: () => t }); const u = { uniqueId: 'bob', nickname: 'Bob' };
const R = (id, trigger, x = {}) => ({ id, name: id, enabled: true, trigger, actions: [], ...x });
const rules = [R('rose', { type: 'gift', giftName: 'Rose' }, { repeatPerGift: true }), R('big', { type: 'gift', minDiamonds: 100 }),
  R('likes', { type: 'like', likeEvery: 100 }), R('jump', { type: 'chat', command: '!jump' }, { cooldownSec: 5 }), R('fol', { type: 'follow' })];
const m = (ev) => e.match(ev, rules).map((f) => f.rule.id + ':' + f.times);
assert.deepEqual(m({ type: 'gift', user: u, gift: { name: 'rose', diamonds: 1, count: 30 } }), ['rose:20']);
assert.deepEqual(m({ type: 'gift', user: u, gift: { name: 'Galaxy', diamonds: 1000, count: 1 } }), ['big:1']);
assert.deepEqual(m({ type: 'like', user: u, likeCount: 99 }), []);
assert.deepEqual(m({ type: 'like', user: u, likeCount: 1 }), ['likes:1']);
assert.deepEqual(m({ type: 'chat', user: u, comment: '!jump now' }), ['jump:1']);
t = 4000; assert.deepEqual(m({ type: 'chat', user: u, comment: '!jump' }), []);
t = 5000; assert.deepEqual(m({ type: 'chat', user: u, comment: '!jumping' }), []);
assert.deepEqual(m({ type: 'chat', user: u, comment: '!JUMP' }), ['jump:1']);
assert.deepEqual(m({ type: 'follow', user: u }), ['fol:1']);
assert.deepEqual(m({ type: 'follow', user: u }), []);
assert.equal(fillTemplate('{nickname} {gift} x{count} {diamonds}', { user: u, gift: { name: 'Rose', diamonds: 1, count: 5 } }), 'Bob Rose x5 5');
console.log('all rule tests passed');
