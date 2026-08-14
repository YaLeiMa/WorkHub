'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hermesShell', {
  hostStatus: () => ipcRenderer.invoke('host:status'),
  sendChat: (messages) => ipcRenderer.invoke('chat:send', { messages }),
  onDelta: (fn) => {
    const listener = (_event, chunk) => fn(chunk);
    ipcRenderer.on('chat:delta', listener);
    return () => ipcRenderer.removeListener('chat:delta', listener);
  },
  onTool: (fn) => {
    const listener = (_event, text) => fn(text);
    ipcRenderer.on('chat:tool', listener);
    return () => ipcRenderer.removeListener('chat:tool', listener);
  },
});
