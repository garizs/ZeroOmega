const KEY = 'failedHosts';
const MAX = 200;
const IGNORE = ['sentry.io', 'googletagmanager.com', 'doubleclick.net', 'facebook.net', 'scorecardresearch.com', 'adsystem'];
const recent = new Map(); // debounce map
let buffer = [];

// heartbeat to keep worker alive for logs
setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 25 * 1000);
console.log('failure catcher worker started');

chrome.storage.session.get({ [KEY]: [] }, res => {
  buffer = res[KEY] || [];
});

function normalize(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (e) {
    return null;
  }
  host = host.replace(/^www\./, '');
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return null; // ipv4
  if (host.includes(':')) return null; // ipv6
  if (IGNORE.some(d => host.includes(d))) return null;
  return host;
}

function debounced(host, error) {
  const key = host + '|' + error;
  const now = Date.now();
  const last = recent.get(key) || 0;
  if (now - last < 4000) return true;
  recent.set(key, now);
  setTimeout(() => recent.delete(key), 4000);
  return false;
}

function save() {
  chrome.storage.session.set({ [KEY]: buffer }, () => {
    try {
      chrome.runtime.sendMessage({ type: 'failed_hosts_updated' });
    } catch (e) {
      // no listeners
    }
  });
}

function record(host, error) {
  const now = Date.now();
  const idx = buffer.findIndex(r => r.host === host);
  if (idx >= 0) {
    const rec = buffer.splice(idx, 1)[0];
    rec.hits = (rec.hits || 0) + 1;
    rec.lastError = error;
    rec.lastSeen = now;
    buffer.push(rec);
  } else {
    buffer.push({ host, lastError: error, lastSeen: now, hits: 1 });
  }
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
  save();
}

function handleError(details) {
  const host = normalize(details.url);
  if (!host) return;
  const err = details.error || 'error';
  if (debounced(host, err)) return;
  record(host, err);
}

function handleCompleted(details) {
  if (!details.statusCode || details.statusCode < 400) return;
  const host = normalize(details.url);
  if (!host) return;
  const err = String(details.statusCode);
  if (debounced(host, err)) return;
  record(host, err);
}

chrome.webRequest.onErrorOccurred.addListener(handleError, { urls: ['<all_urls>'] });
chrome.webRequest.onCompleted.addListener(handleCompleted, { urls: ['<all_urls>'] });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'GET_FAILED_HOSTS') {
    chrome.storage.session.get({ [KEY]: [] }, res => {
      const list = (res[KEY] || []).slice().sort((a, b) => b.lastSeen - a.lastSeen);
      sendResponse(list);
    });
    return true;
  }
  if (msg && msg.type === 'ADD_TO_PROXY') {
    const domains = Array.isArray(msg.domains) ? msg.domains : [];
    Promise.all(domains.map(domain => {
      return fetch('http://127.0.0.1:9099/add-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      }).then(res => ({ domain, ok: res.ok, status: res.status }))
        .catch(err => ({ domain, ok: false, error: err.message }));
    })).then(results => sendResponse(results));
    return true;
  }
});
