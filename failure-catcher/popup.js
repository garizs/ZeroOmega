const LOG_PREFIX = '[popup]';
let failedHosts = [];

function log(...args) {
  const ts = new Date().toISOString();
  console.log(ts, LOG_PREFIX, ...args);
}

function setStatus(msg, isError=false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.color = isError ? 'red' : 'green';
}

function requestHosts() {
  log('requesting failed hosts');
  chrome.runtime.sendMessage({type: 'GET_FAILED_HOSTS'}, resp => {
    if (chrome.runtime.lastError) {
      log('GET_FAILED_HOSTS error', chrome.runtime.lastError);
      return;
    }
    log('received hosts', resp);
    failedHosts = resp.hosts || [];
    renderList();
  });
}

function renderList() {
  log('render list');
  const filter = document.getElementById('filter').value.toLowerCase();
  const ul = document.getElementById('list');
  ul.innerHTML = '';
  failedHosts.filter(h => !filter || h.host.includes(filter)).forEach((h, idx) => {
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.host = h.host;
    li.appendChild(cb);
    const span = document.createElement('span');
    span.textContent = h.host + ' (' + h.error + ')';
    li.appendChild(span);
    ul.appendChild(li);
  });
}

document.getElementById('refresh').addEventListener('click', () => {
  log('refresh clicked');
  requestHosts();
});

document.getElementById('selectAll').addEventListener('click', () => {
  log('select all');
  document.querySelectorAll('#list input[type=checkbox]').forEach(cb => cb.checked = true);
});

document.getElementById('clearAll').addEventListener('click', () => {
  const count = failedHosts.length;
  log('clear all clicked', {count});
  failedHosts = [];
  chrome.storage.session.set({failedHosts: []});
  renderList();
  chrome.runtime.sendMessage({type: 'CLEAR_FAILED_HOSTS'}, resp => {
    if (chrome.runtime.lastError) {
      log('CLEAR_FAILED_HOSTS error', chrome.runtime.lastError);
      setStatus('Error clearing', true);
      return;
    }
    log('CLEAR_FAILED_HOSTS response', resp);
    setStatus(resp.ok ? 'Cleared ' + resp.countCleared : 'Failed', !resp.ok);
    log('state after clear', {remaining: failedHosts.length});
  });
});

document.getElementById('addSelected').addEventListener('click', () => {
  const hosts = Array.from(document.querySelectorAll('#list input[type=checkbox]:checked')).map(cb => cb.dataset.host);
  log('add selected', hosts);
  if (!hosts.length) { setStatus('No hosts selected', true); return; }
  setStatus('Sending...');
  chrome.runtime.sendMessage({type: 'ADD_TO_PROXY', hosts}, resp => {
    if (chrome.runtime.lastError) {
      log('ADD_TO_PROXY error', chrome.runtime.lastError);
      setStatus('Error sending', true);
      return;
    }
    log('ADD_TO_PROXY response', resp);
    const added = resp.added || [];
    const failed = resp.failed || [];
    if (added.length) {
      log('pruning added hosts', added);
      failedHosts = failedHosts.filter(h => !added.includes(h.host));
      chrome.storage.session.set({failedHosts});
      renderList();
      chrome.runtime.sendMessage({type: 'PRUNE_FAILED_HOSTS', hosts: added}, r => {
        if (chrome.runtime.lastError) log('PRUNE_FAILED_HOSTS error', chrome.runtime.lastError);
        else log('PRUNE_FAILED_HOSTS response', r);
      });
    }
    if (failed.length) {
      log('marking failed hosts', failed);
      failedHosts = failedHosts.map(h => failed.includes(h.host) ? {...h, error: 'add-failed'} : h);
      chrome.storage.session.set({failedHosts});
      renderList();
    }
    const ok = resp.ok && !failed.length;
    const msg = ok ? 'Sent (' + added.length + ')' : 'Partial: ' + added.length + ' ok, ' + failed.length + ' failed';
    setStatus(msg, !ok);
  });
});

document.getElementById('addManual').addEventListener('click', () => {
  const domain = document.getElementById('manualDomain').value.trim();
  if (!domain) { setStatus('Enter domain', true); return; }
  log('add manual', domain);
  chrome.runtime.sendMessage({type: 'ADD_TO_PROXY', hosts: [domain]}, resp => {
    if (chrome.runtime.lastError) {
      log('ADD_TO_PROXY manual error', chrome.runtime.lastError);
      setStatus('Error sending', true);
      return;
    }
    log('manual add response', resp);
    setStatus(resp.ok ? 'Sent (' + resp.status + ')' : 'Failed', !resp.ok);
  });
});

document.getElementById('filter').addEventListener('input', () => {
  log('filter change');
  renderList();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'failed_hosts_updated') {
    log('failed_hosts_updated received');
    requestHosts();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  log('popup init');
  requestHosts();
});
