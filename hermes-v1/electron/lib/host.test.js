'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CANT_REACH,
  loadConfigFrom,
  endpoints,
  isReachError,
  reachError,
  parseSseBlock,
  extractDelta,
} = require('./host');

test('env wins over file; no default host', () => {
  const cfg = loadConfigFrom(
    { HERMES_BASE_URL: 'http://example.invalid/v1', HERMES_API_KEY: 'env-key' },
    { HERMES_BASE_URL: 'http://file.invalid', HERMES_API_KEY: 'file-key' },
  );
  assert.equal(cfg.baseUrl, 'http://example.invalid/v1');
  assert.equal(cfg.apiKey, 'env-key');
});

test('file config used when env empty', () => {
  const cfg = loadConfigFrom({}, { HERMES_BASE_URL: 'https://gw.example/v1/', apiKey: 'k' });
  assert.equal(cfg.baseUrl, 'https://gw.example/v1');
  assert.equal(cfg.apiKey, 'k');
});

test('missing base url does not invent ip or port', () => {
  const cfg = loadConfigFrom({}, {});
  assert.equal(cfg.baseUrl, '');
  const ep = endpoints(cfg.baseUrl);
  assert.equal(ep.ok, false);
  assert.match(ep.error, /can't reach host/);
});

test('joins /v1/chat/completions with or without /v1 suffix', () => {
  const a = endpoints('http://gw.example:9');
  const b = endpoints('http://gw.example:9/v1');
  assert.equal(a.ok, true);
  assert.equal(a.chatCompletions, 'http://gw.example:9/v1/chat/completions');
  assert.equal(b.chatCompletions, 'http://gw.example:9/v1/chat/completions');
});

test('reach errors map to can\'t reach host', () => {
  assert.equal(isReachError({ code: 'ECONNREFUSED' }), true);
  assert.match(reachError({ code: 'ECONNREFUSED' }), /can't reach host/);
  assert.equal(CANT_REACH.includes("can't reach host"), true);
});

test('sse chat.completion.chunk delta', () => {
  const { event, data } = parseSseBlock('event: message\ndata: {"choices":[{"delta":{"content":"你好"}}]}');
  assert.equal(event, 'message');
  const extracted = extractDelta(JSON.parse(data));
  assert.equal(extracted.text, '你好');
});

test('hermes.tool.progress is not assistant text', () => {
  const extracted = extractDelta({ object: 'hermes.tool.progress', tool: 'kanban_create', status: 'start' });
  assert.equal(extracted.text, '');
  assert.match(extracted.tool, /kanban_create/);
});
