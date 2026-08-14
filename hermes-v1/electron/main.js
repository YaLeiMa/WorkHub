'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { loadConfigFrom, endpoints, reachError } = require('./lib/host');

let mainWindow = null;
let sessionId = `hermes-v1-shell-${Date.now()}`;

function readJsonIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    // ignore malformed local config; env can still win
  }
  return {};
}

function loadConfig() {
  const candidates = [
    path.join(process.cwd(), 'config.local.json'),
    path.join(__dirname, 'config.local.json'),
  ];
  try {
    candidates.push(path.join(app.getPath('userData'), 'config.local.json'));
  } catch {
    // app may not be ready
  }
  let fileCfg = {};
  for (const candidate of candidates) {
    const parsed = readJsonIfExists(candidate);
    if (parsed && Object.keys(parsed).length) {
      fileCfg = parsed;
      break;
    }
  }
  return loadConfigFrom(process.env, fileCfg);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 860,
    minWidth: 420,
    minHeight: 520,
    title: 'Hermes 群聊',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('host:status', async () => {
  const cfg = loadConfig();
  const ep = endpoints(cfg.baseUrl);
  if (!ep.ok) {
    return { ok: false, error: ep.error };
  }
  const headers = { Accept: 'application/json' };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    let res = await fetch(ep.health, { method: 'GET', headers, signal: controller.signal });
    if (res.status === 404) {
      res = await fetch(ep.healthV1, { method: 'GET', headers, signal: controller.signal });
    }
    if (!res.ok) {
      return { ok: false, error: `无法连接主机（can't reach host）：HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: reachError(err) };
  } finally {
    clearTimeout(timer);
  }
});

ipcMain.handle('chat:send', async (ipcEvent, payload) => {
  const messages = Array.isArray(payload && payload.messages) ? payload.messages : [];
  const cfg = loadConfig();
  const ep = endpoints(cfg.baseUrl);
  if (!ep.ok) {
    return { ok: false, error: ep.error };
  }
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  headers['X-Hermes-Session-Id'] = sessionId;
  headers['X-Hermes-Session-Key'] = 'hermes-v1-electron-shell';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  let res;
  try {
    res = await fetch(ep.chatCompletions, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'hermes-agent',
        stream: true,
        messages,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: reachError(err) };
  }

  if (!res.ok) {
    clearTimeout(timer);
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    if (res.status >= 500 || res.status === 404) {
      return { ok: false, error: `无法连接主机（can't reach host）：HTTP ${res.status}` };
    }
    return { ok: false, error: `主机返回 HTTP ${res.status}${detail ? `：${detail}` : ''}` };
  }
  if (!res.body) {
    clearTimeout(timer);
    return { ok: false, error: '无法连接主机（can\'t reach host）：响应没有正文' };
  }

  const { parseSseBlock, extractDelta } = require('./lib/host');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';
      for (const part of parts) {
        const { event: eventName, data } = parseSseBlock(part);
        if (!data || data === '[DONE]') continue;
        let payloadJson;
        try {
          payloadJson = JSON.parse(data);
        } catch {
          continue;
        }
        const extracted = extractDelta(payloadJson);
        if (eventName === 'hermes.tool.progress' || extracted.tool) {
          ipcEvent.sender.send('chat:tool', extracted.tool || '工具进行中');
        }
        if (extracted.text) {
          fullText += extracted.text;
          ipcEvent.sender.send('chat:delta', extracted.text);
        }
      }
    }
    return { ok: true, text: fullText };
  } catch (err) {
    return { ok: false, error: reachError(err), text: fullText };
  } finally {
    clearTimeout(timer);
  }
});
