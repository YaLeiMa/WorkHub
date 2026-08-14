'use strict';

const CANT_REACH = '无法连接主机（can\'t reach host）';

function trimSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function loadConfigFrom(env, fileCfg) {
  const file = fileCfg && typeof fileCfg === 'object' ? fileCfg : {};
  return {
    baseUrl: trimSlash(env.HERMES_BASE_URL || file.HERMES_BASE_URL || file.baseUrl || ''),
    apiKey: String(env.HERMES_API_KEY || file.HERMES_API_KEY || file.apiKey || '').trim(),
  };
}

function endpoints(baseUrl) {
  const base = trimSlash(baseUrl);
  if (!base) {
    return { ok: false, error: `未配置 HERMES_BASE_URL。${CANT_REACH}` };
  }
  let url;
  try {
    url = new URL(base);
  } catch {
    return { ok: false, error: `HERMES_BASE_URL 无效。${CANT_REACH}` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: `HERMES_BASE_URL 必须是 http(s)。${CANT_REACH}` };
  }
  const root = `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
  const v1Root = root.endsWith('/v1') ? root : `${root}/v1`;
  const origin = `${url.protocol}//${url.host}`;
  return {
    ok: true,
    chatCompletions: `${v1Root}/chat/completions`,
    health: `${origin}/health`,
    healthV1: `${v1Root}/health`,
  };
}

function isReachError(err) {
  if (!err) return false;
  const code = err.code || err.cause?.code || '';
  const name = err.name || err.cause?.name || '';
  const msg = String(err.message || err.cause?.message || '');
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)) {
    return true;
  }
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND|timed out/i.test(msg)) return true;
  return false;
}

function reachError(err) {
  if (isReachError(err)) return CANT_REACH;
  const msg = String(err && (err.message || err) || '').trim();
  return msg ? `${CANT_REACH}：${msg}` : CANT_REACH;
}

function parseSseBlock(block) {
  const lines = String(block).split(/\r?\n/);
  let event = 'message';
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  const data = dataLines.join('\n');
  return { event, data };
}

function extractDelta(payload) {
  if (!payload || typeof payload !== 'object') return { text: '', tool: '' };
  if (payload.object === 'hermes.tool.progress' || payload.type === 'hermes.tool.progress') {
    const name = payload.tool || payload.name || payload.tool_name || '';
    const status = payload.status || payload.phase || 'running';
    return { text: '', tool: name ? `${name} ${status}` : '工具进行中' };
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  const delta = choice && choice.delta ? choice.delta : {};
  const content = delta.content;
  if (typeof content === 'string') return { text: content, tool: '' };
  return { text: '', tool: '' };
}

module.exports = {
  CANT_REACH,
  loadConfigFrom,
  endpoints,
  isReachError,
  reachError,
  parseSseBlock,
  extractDelta,
};
