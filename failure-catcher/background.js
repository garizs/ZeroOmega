/* Background script for ZeroOmega Failure Catcher */
const LOG_PREFIX = '[background]';
const HEARTBEAT_INTERVAL = 30000; // 30s
const DEBOUNCE_MS = 4000; // 4s
const MAX_BUFFER = 200;
const IGNORE = ['sentry.io', 'googletagmanager.com', 'doubleclick.net', 'facebook.net', 'scorecardresearch.com', 'adsystem'];

let failedHosts = [];
const debounceMap = new Map();

function log(...args) {
  const ts = new Date().toISOString();
  console.log(ts, LOG_PREFIX, ...args);
}

function normalizeHost(url) {
  try {
    const u = new URL(url);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    // Skip IP addresses
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:]+\]$/.test(host)) return null;
    return host;
  } catch (e) {
    log('normalizeHost failed', url, e);
    return null;
  }
}

function loadFromStorage() {
  chrome.storage.session.get({failedHosts: []}, data => {
    if (chrome.runtime.lastError) log('storage get error', chrome.runtime.lastError);
    failedHosts = data.failedHosts || [];
    log('loaded from storage', failedHosts.length);
  });
}

function saveToStorage() {
  chrome.storage.session.set({failedHosts}, () => {
    if (chrome.runtime.lastError) log('storage set error', chrome.runtime.lastError);
    log('storage updated', failedHosts.length);
    chrome.runtime.sendMessage({type: 'failed_hosts_updated'}, () => {
      if (chrome.runtime.lastError) log('broadcast error', chrome.runtime.lastError);
    });
  });
}

function shouldIgnore(host) {
  return IGNORE.some(p => host.includes(p));
}

function addFailure(host, error) {
  const key = host + '|' + error;
  const now = Date.now();
  const last = debounceMap.get(key) || 0;
  if (now - last < DEBOUNCE_MS) {
    log('debounce', host, error);
    return;
  }
  debounceMap.set(key, now);
  if (shouldIgnore(host)) {
    log('ignored host', host);
    return;
  }
  failedHosts.push({host, error, time: now});
  if (failedHosts.length > MAX_BUFFER) failedHosts = failedHosts.slice(-MAX_BUFFER);
  log('captured', host, error);
  saveToStorage();
}

function handleCompleted(details) {
  if (details.statusCode >= 400) {
    const host = normalizeHost(details.url);
    if (host) addFailure(host, String(details.statusCode));
  }
}

function handleError(details) {
  const host = normalizeHost(details.url);
  if (host) addFailure(host, details.error || 'error');
}

chrome.webRequest.onCompleted.addListener(handleCompleted, {urls: ['<all_urls>']});
chrome.webRequest.onErrorOccurred.addListener(handleError, {urls: ['<all_urls>']});
log('listeners registered');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  log('message received', msg);
  if (msg && msg.type === 'GET_FAILED_HOSTS') {
    sendResponse({hosts: failedHosts});
  } else if (msg && msg.type === 'CLEAR_FAILED_HOSTS') {
    const count = failedHosts.length;
    log('CLEAR_FAILED_HOSTS request', {count});
    failedHosts = [];
    saveToStorage();
    log('CLEAR_FAILED_HOSTS done', {remaining: failedHosts.length});
    sendResponse({ok: true, countCleared: count});
  } else if (msg && msg.type === 'PRUNE_FAILED_HOSTS') {
    const hosts = (msg.hosts || []).map(h => normalizeHost('http://' + h)).filter(Boolean);
    log('PRUNE_FAILED_HOSTS request', hosts);
    const before = failedHosts.length;
    failedHosts = failedHosts.filter(h => !hosts.includes(h.host));
    const pruned = before - failedHosts.length;
    saveToStorage();
    log('PRUNE_FAILED_HOSTS done', {requested: hosts.length, pruned, remaining: failedHosts.length});
    sendResponse({ok: true, pruned});
  } else if (msg && msg.type === 'ADD_TO_PROXY') {
    const domains = msg.hosts || [];
    const payload = {domains};
    const endpoint = 'http://127.0.0.1:9099/add-domain';
    log('POST start', endpoint, payload);
    fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    }).then(async res => {
      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        // ignore json parse errors
      }
      const added = data.added || (res.ok ? domains : []);
      const failed = data.failed || (res.ok ? [] : domains);
      log('POST success', {status: res.status, added, failed});
      sendResponse({ok: res.ok, status: res.status, added, failed});
    }).catch(err => {
      log('POST error', err);
      sendResponse({ok: false, error: String(err), added: [], failed: domains});
    });
    return true;
  }
  return true;
});

setInterval(() => log('SW alive', new Date().toISOString()), HEARTBEAT_INTERVAL);

log('startup', new Date().toISOString(), navigator.userAgent);
loadFromStorage();
