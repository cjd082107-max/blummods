// Reset timer: counts down, the save gift stops it, and at zero it wipes the save exactly once.
const assert = require('assert');
const { ResetTimer, END_SHOW_MS } = require('../src/resettimer');

function setup() {
  let t = 0; const timers = [];
  const clock = {
    now: () => t,
    every: (fn, ms) => { const h = { fn, ms, next: t + ms, every: true }; timers.push(h); return h; },
    stopEvery: (h) => { h.dead = true; },
    later: (fn, ms) => { const h = { fn, next: t + ms }; timers.push(h); return h; },
    cancelLater: (h) => { h.dead = true; },
  };
  const out = { shown: [], hidden: 0, resets: [], logs: [] };
  const timer = new ResetTimer({
    draw: async (st) => `${st.phase}:${st.remaining}`,
    show: (png) => out.shown.push(png),
    hide: () => out.hidden++,
    reset: (who) => out.resets.push(who),
    log: (m) => out.logs.push(m),
  }, clock);
  const advance = async (ms) => {
    const end = t + ms;
    while (true) {
      const due = timers.filter((h) => !h.dead && h.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      t = due.next;
      if (due.every) due.next += due.ms; else due.dead = true;
      due.fn();
      await new Promise((r) => setImmediate(r));
    }
    t = end;
    await new Promise((r) => setImmediate(r));
  };
  return { timer, out, advance };
}

(async () => {
  // runs out: one reset, box shows RESET then hides
  {
    const { timer, out, advance } = setup();
    assert.ok(timer.start({ seconds: 5, who: 'Ann', gift: { name: 'Rose' } }));
    await advance(10);
    assert.deepStrictEqual(out.shown, ['count:5']);
    await advance(2000);
    assert.strictEqual(out.shown.at(-1), 'count:3');
    await advance(3000);
    assert.deepStrictEqual(out.resets, ['Ann']);
    assert.strictEqual(out.shown.at(-1), 'reset:0');
    await advance(10000);
    assert.strictEqual(out.resets.length, 1, 'resets only once');
    assert.strictEqual(out.hidden, 1);
    assert.ok(!timer.active);
  }
  // saved in time: no reset, SAVED frame, then hidden
  {
    const { timer, out, advance } = setup();
    timer.start({ seconds: 60, who: 'Ann', gift: { name: 'Rose' } });
    await advance(20000);
    assert.ok(timer.save('Bob'));
    await advance(10);
    assert.strictEqual(out.shown.at(-1), 'saved:40');
    await advance(END_SHOW_MS + 100000);
    assert.deepStrictEqual(out.resets, []);
    assert.strictEqual(out.hidden, 1);
    assert.ok(!timer.save('Cid'), 'nothing to save once it is over');
  }
  // a second reset timer while one runs is ignored
  {
    const { timer, out, advance } = setup();
    timer.start({ seconds: 30, who: 'Ann' });
    await advance(5000);
    assert.ok(!timer.start({ seconds: 30, who: 'Bob' }));
    await advance(25000);
    assert.deepStrictEqual(out.resets, ['Ann']);
  }
  // a new timer can start while the last one's RESET!/SAVED! is still showing
  {
    const { timer, out, advance } = setup();
    timer.start({ seconds: 5, who: 'Ann' });
    timer.save('Bob');
    assert.ok(timer.start({ seconds: 5, who: 'Cid' }));
    await advance(6000);
    assert.deepStrictEqual(out.resets, ['Cid']);
  }
  console.log('resettimer: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
