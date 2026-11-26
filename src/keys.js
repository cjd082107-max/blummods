// Sends key presses / mouse clicks to whatever window is focused (your game).
// Uses one long-running PowerShell helper so each press is fast.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const VK = {
  BACKSPACE: 0x08, TAB: 0x09, ENTER: 0x0d, SHIFT: 0x10, CTRL: 0x11, ALT: 0x12,
  CAPSLOCK: 0x14, ESCAPE: 0x1b, ESC: 0x1b, SPACE: 0x20, PAGEUP: 0x21, PAGEDOWN: 0x22,
  END: 0x23, HOME: 0x24, LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28,
  INSERT: 0x2d, DELETE: 0x2e,
  NUM0: 0x60, NUM1: 0x61, NUM2: 0x62, NUM3: 0x63, NUM4: 0x64, NUM5: 0x65,
  NUM6: 0x66, NUM7: 0x67, NUM8: 0x68, NUM9: 0x69,
  ';': 0xba, '=': 0xbb, ',': 0xbc, '-': 0xbd, '.': 0xbe, '/': 0xbf, '`': 0xc0,
  '[': 0xdb, '\\': 0xdc, ']': 0xdd, "'": 0xde,
};
for (let i = 0; i < 26; i++) VK[String.fromCharCode(65 + i)] = 65 + i;
for (let i = 0; i <= 9; i++) VK[String(i)] = 48 + i;
for (let i = 1; i <= 12; i++) VK['F' + i] = 0x6f + i;
const EXTENDED = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e]);
const MOUSE = {
  MOUSELEFT: [0x02, 0x04], MOUSERIGHT: [0x08, 0x10], MOUSEMIDDLE: [0x20, 0x40],
};

const KEY_CHOICES = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), ...'0123456789'.split(''),
  'Space', 'Enter', 'Escape', 'Tab', 'Shift', 'Ctrl', 'Alt', 'Backspace',
  'Up', 'Down', 'Left', 'Right', ...Array.from({ length: 12 }, (_, i) => 'F' + (i + 1)),
  'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
  'Num0', 'Num1', 'Num2', 'Num3', 'Num4', 'Num5', 'Num6', 'Num7', 'Num8', 'Num9',
  'MouseLeft', 'MouseRight', 'MouseMiddle',
];

// "Ctrl+Shift+S" -> [{vk,ext}...] or mouse
function parseCombo(combo) {
  const parts = String(combo || '').split('+').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!parts.length) throw new Error('No key set');
  return parts.map((p) => {
    if (MOUSE[p]) return { mouse: MOUSE[p] };
    const vk = VK[p];
    if (vk === undefined) throw new Error(`Unknown key "${p}"`);
    return { vk, ext: EXTENDED.has(vk) };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class KeySender {
  constructor(workDir, log = () => {}) {
    this.workDir = workDir;
    this.log = log;
    this.proc = null;
  }

  ensure() {
    if (this.proc) return true;
    if (process.platform !== 'win32') { this.log('Key presses only work on Windows'); return false; }
    const src = fs.readFileSync(path.join(__dirname, 'keys.ps1'), 'utf8');
    const script = path.join(this.workDir, 'blummods-keys.ps1');
    fs.writeFileSync(script, src);
    this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
    this.ready = new Promise((res) => {
      this.proc.stdout.on('data', (d) => {
        const s = d.toString().trim();
        if (s.includes('READY')) res();
        if (s.startsWith('ERR')) this.log('Key error: ' + s);
      });
      setTimeout(res, 8000);
    });
    this.proc.on('exit', () => { this.proc = null; });
    return true;
  }

  send(line) { if (this.proc) this.proc.stdin.write(line + '\n'); }

  async press(combo, holdMs = 80) {
    const keys = parseCombo(combo);
    if (!this.ensure()) return;
    await this.ready;
    for (const k of keys) {
      if (k.mouse) this.send(`MOUSE ${k.mouse[0]}`);
      else this.send(`DOWN ${k.vk} ${k.ext ? 1 : 0}`);
      await sleep(15);
    }
    await sleep(Math.max(20, holdMs));
    for (const k of [...keys].reverse()) {
      if (k.mouse) this.send(`MOUSE ${k.mouse[1]}`);
      else this.send(`UP ${k.vk} ${k.ext ? 1 : 0}`);
      await sleep(15);
    }
  }

  stop() { if (this.proc) { this.proc.stdin.end(); this.proc.kill(); this.proc = null; } }
}

module.exports = { KeySender, KEY_CHOICES, parseCombo };
