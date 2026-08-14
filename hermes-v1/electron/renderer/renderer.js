'use strict';

const logEl = document.getElementById('log');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const statusEl = document.getElementById('status');

const history = [];
let busy = false;
let offDelta = null;
let offTool = null;

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status${kind ? ` ${kind}` : ''}`;
}

function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = role === 'user' ? '我' : role === 'assistant' ? '群入口' : '系统';
  el.appendChild(who);
  const body = document.createElement('span');
  body.className = 'body';
  body.textContent = text;
  el.appendChild(body);
  logEl.appendChild(el);
  logEl.scrollTop = logEl.scrollHeight;
  return body;
}

async function refreshHost() {
  try {
    const result = await window.hermesShell.hostStatus();
    if (result.ok) {
      setStatus('已连接主机 gateway（api_server）', 'ok');
      return true;
    }
    setStatus(result.error || '无法连接主机（can\'t reach host）', 'bad');
    return false;
  } catch (err) {
    setStatus('无法连接主机（can\'t reach host）', 'bad');
    return false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  busy = true;
  sendBtn.disabled = true;
  input.value = '';
  addMsg('user', text);
  history.push({ role: 'user', content: text });

  const body = addMsg('assistant', '');
  let assembled = '';
  offDelta = window.hermesShell.onDelta((chunk) => {
    assembled += chunk;
    body.textContent = assembled;
    logEl.scrollTop = logEl.scrollHeight;
  });
  offTool = window.hermesShell.onTool((toolText) => {
    setStatus(toolText, '');
  });

  try {
    const result = await window.hermesShell.sendChat(history);
    if (!result.ok) {
      body.parentElement.className = 'msg system';
      body.parentElement.querySelector('.who').textContent = '系统';
      body.textContent = result.error || '无法连接主机（can\'t reach host）';
      history.pop();
      await refreshHost();
    } else {
      const finalText = result.text || assembled || '（无回复）';
      body.textContent = finalText;
      history.push({ role: 'assistant', content: finalText });
      setStatus('已连接主机 gateway（api_server）', 'ok');
    }
  } catch (err) {
    body.parentElement.className = 'msg system';
    body.parentElement.querySelector('.who').textContent = '系统';
    body.textContent = '无法连接主机（can\'t reach host）';
    history.pop();
  } finally {
    if (offDelta) offDelta();
    if (offTool) offTool();
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

refreshHost();
