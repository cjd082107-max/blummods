// Reset timer: a viewer starts a countdown, the save gift cancels it, and at zero the save is wiped.
// The app runs it once for every game. Each game mod only shows the picture it is sent in the middle of the screen.
//
// hooks:
//   draw(state)  -> Promise<base64 PNG | ''>   renders the box for this moment
//   show(png)    sends that picture to the game
//   hide()       takes the box off the screen
//   reset(who)   wipes the save (the game's save_reset)
//   log(text, level)
const END_SHOW_MS = 2500; // how long "SAVED!" or "RESET!" stays up

class ResetTimer {
  constructor(hooks, clock = { now: Date.now, every: setInterval, stopEvery: clearInterval, later: setTimeout, cancelLater: clearTimeout }) {
    this.h = hooks;
    this.c = clock;
    this.state = null; // { phase: 'count'|'saved'|'reset', endsAt, total, remaining, who, saver, gift: { name, image } }
    this.ticker = null;
    this.endTimer = null;
    this.seq = 0;
  }

  get active() { return !!this.state && this.state.phase === 'count'; }

  start({ seconds, who, gift }) {
    if (this.active) { this.h.log(`${who} sent a reset timer, but one is already counting down (${this.state.remaining}s left).`, 'warn'); return false; }
    this.clear();
    const total = Math.max(1, Math.round(Number(seconds) || 60));
    this.state = { phase: 'count', endsAt: this.c.now() + total * 1000, total, remaining: total, who: who || 'Someone', saver: '', gift: gift || null };
    this.h.log(`${this.state.who} started a ${total}s reset timer. ${gift?.name ? `Send a ${gift.name} to save the run!` : 'No "Save from reset" trigger is set up for this game, so nothing can stop it.'}`, gift?.name ? 'warn' : 'bad');
    this.frame();
    this.ticker = this.c.every(() => this.tick(), 200);
    return true;
  }

  save(who) {
    if (!this.active) { this.h.log(`${who || 'Someone'} sent the save gift, but no reset timer is running.`); return false; }
    this.stopTicker();
    this.state.phase = 'saved';
    this.state.saver = who || 'Someone';
    this.h.log(`${this.state.saver} SAVED the run with ${this.state.remaining}s left!`, 'good');
    this.frame();
    this.endTimer = this.c.later(() => this.clear(), END_SHOW_MS);
    return true;
  }

  tick() {
    if (!this.active) return;
    const left = Math.max(0, Math.ceil((this.state.endsAt - this.c.now()) / 1000));
    if (left <= 0) return this.expire();
    if (left !== this.state.remaining) { this.state.remaining = left; this.frame(); }
  }

  expire() {
    this.stopTicker();
    this.state.phase = 'reset';
    this.state.remaining = 0;
    this.h.log(`Time's up! ${this.state.who}'s reset timer wiped the save.`, 'bad');
    this.h.reset(this.state.who);
    this.frame();
    this.endTimer = this.c.later(() => this.clear(), END_SHOW_MS);
  }

  // Draws the box for the current moment and sends it. Late drawings (an older second) are dropped.
  async frame() {
    const n = ++this.seq;
    const snapshot = { ...this.state };
    let png = '';
    try { png = await this.h.draw(snapshot); } catch (e) { this.h.log('Reset timer box could not be drawn: ' + e.message, 'warn'); }
    if (png && n === this.seq && this.state) this.h.show(png);
  }

  stopTicker() { if (this.ticker) { this.c.stopEvery(this.ticker); this.ticker = null; } }

  clear() {
    this.stopTicker();
    if (this.endTimer) { this.c.cancelLater(this.endTimer); this.endTimer = null; }
    const had = !!this.state;
    this.state = null;
    this.seq++;
    if (had) this.h.hide();
  }
}

module.exports = { ResetTimer, END_SHOW_MS };
