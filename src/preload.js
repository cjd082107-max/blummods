const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
contextBridge.exposeInMainWorld('blum', {
  init: invoke('get-init'),
  save: invoke('save'),
  connect: invoke('connect'),
  disconnect: invoke('disconnect'),
  refreshGifts: invoke('refresh-gifts'),
  modStatus: invoke('mod-status'),
  pluginsRefresh: invoke('plugins-refresh'),
  modInstall: invoke('mod-install'),
  modRemove: invoke('mod-remove'),
  updateCheck: invoke('update-check'),
  updateInstall: invoke('update-install'),
  simulate: invoke('simulate'),
  testActions: invoke('test-actions'),
  clearQueue: invoke('clear-queue'),
  resetSession: invoke('reset-session'),
  pickExe: invoke('pick-exe'),
  pickImage: invoke('pick-image'),
  pickSound: invoke('pick-sound'),
  launchGame: invoke('launch-game'),
  openFolder: invoke('open-folder'),
  openUrl: invoke('open-url'),
  exportData: invoke('export-data'),
  importData: invoke('import-data'),
  on: (ch, fn) => {
    const ok = ['log', 'status', 'event', 'stats', 'mods', 'queue', 'alert', 'play-sound', 'gift-list', 'update', 'feed', 'mod-progress', 'plugins', 'games-added'];
    if (ok.includes(ch)) ipcRenderer.on(ch, (_e, p) => fn(p));
  },
});
