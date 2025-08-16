const KEY = 'failedHosts';
const MAX = 200;
const IGNORE = ['sentry.io', 'googletagmanager.com', 'doubleclick.net', 'facebook.net', 'scorecardresearch.com', 'adsystem'];
const recent = new Map(); // debounce map
let buffer = [];

// Startup banner with diagnostics
console.log('=== ZeroOmega Failure Catcher Background Worker ===');
console.log('READY:', new Date().toISOString());
console.log('User-Agent:', navigator.userAgent);

// heartbeat to keep worker alive for logs
setInterval(() => {
  chrome.runtime.getPlatformInfo(() => { });
  console.log('SW alive - heartbeat');
}, 30000);

chrome.storage.session.get({ [KEY]: [] }, res => {
  buffer = res[KEY] || [];
  console.log('Loaded from storage:', buffer.length, 'items');
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
      console.log('Storage updated, broadcast sent');
    } catch (e) {
      console.log('Broadcast failed:', e.message);
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
  if (!host) {
    console.log('IGNORED network error - invalid host:', details.url);
    return;
  }
  const err = details.error || 'error';
  if (debounced(host, err)) {
    console.log('IGNORED network error - debounced:', host, err);
    return;
  }
  console.log('KEPT network error:', host, err);
  record(host, err);
}

function handleCompleted(details) {
  if (!details.statusCode || details.statusCode < 400) return;
  const host = normalize(details.url);
  if (!host) {
    console.log('IGNORED HTTP error - invalid host:', details.url);
    return;
  }
  const err = String(details.statusCode);
  if (debounced(host, err)) {
    console.log('IGNORED HTTP error - debounced:', host, err);
    return;
  }
  console.log('KEPT HTTP error:', host, err);
  record(host, err);
}

// Register listeners
chrome.webRequest.onErrorOccurred.addListener(handleError, { urls: ['<all_urls>'] });
chrome.webRequest.onCompleted.addListener(handleCompleted, { urls: ['<all_urls>'] });
console.log('WebRequest listeners registered');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('Message received:', msg.type);

  if (msg && msg.type === 'GET_FAILED_HOSTS') {
    chrome.storage.session.get({ [KEY]: [] }, res => {
      const list = (res[KEY] || []).slice().sort((a, b) => b.lastSeen - a.lastSeen);
      console.log('GET_FAILED_HOSTS: returning', list.length, 'items');
      sendResponse(list);
    });
    return true;
  }

  if (msg && msg.type === 'CLEAR_FAILED_HOSTS') {
    const countCleared = buffer.length;
    buffer = [];
    save();
    console.log('CLEAR_FAILED_HOSTS: cleared', countCleared, 'items');
    sendResponse({ ok: true, countCleared });
    return true;
  }

  if (msg && msg.type === 'PRUNE_FAILED_HOSTS') {
    const hosts = msg.hosts || [];
    let pruned = 0;

    hosts.forEach(host => {
      const normalizedHost = normalize(host);
      if (normalizedHost) {
        const idx = buffer.findIndex(r => r.host === normalizedHost);
        if (idx >= 0) {
          buffer.splice(idx, 1);
          pruned++;
        }
      }
    });

    if (pruned > 0) {
      save();
      console.log('PRUNE_FAILED_HOSTS: pruned', pruned, 'hosts');
    }

    sendResponse({ ok: true, pruned });
    return true;
  }

  if (msg && msg.type === 'ADD_TO_PROXY') {
    const domains = Array.isArray(msg.domains) ? msg.domains : [];
    console.log('ADD_TO_PROXY: processing', domains.length, 'domains');

    Promise.all(domains.map(domain => {
      return fetch('http://127.0.0.1:9099/add-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      }).then(res => ({ domain, ok: res.ok, status: res.status }))
        .catch(err => ({ domain, ok: false, error: err.message }));
    })).then(results => {
      const successful = results.filter(r => r.ok).length;
      const failed = results.length - successful;
      console.log('ADD_TO_PROXY: success', successful, 'failed', failed);
      sendResponse(results);
    });
    return true;
  }
});
