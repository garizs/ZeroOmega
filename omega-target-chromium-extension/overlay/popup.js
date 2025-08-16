(function () {
  const failuresEl = document.getElementById('failures');
  const selectAllBtn = document.getElementById('select-all');
  const clearBtn = document.getElementById('clear-selection');
  const clearAllBtn = document.getElementById('clear-all');
  const filterInput = document.getElementById('filter');
  const addSelectedBtn = document.getElementById('add-selected');
  const statusEl = document.getElementById('status');
  const manualInput = document.getElementById('manual-domain');
  const manualAddBtn = document.getElementById('manual-add');

  let current = [];
  let traceId = 0;

  function log(...args) {
    console.log('[popup]', ...args);
  }

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'red' : 'green';
    if (msg) {
      setTimeout(() => {
        if (statusEl.textContent === msg) statusEl.textContent = '';
      }, 5000);
    }
  }

  function render() {
    const filter = filterInput.value.trim().toLowerCase();
    failuresEl.innerHTML = '';
    const list = current.filter(item => item.host.includes(filter));

    if (!list.length) {
      const li = document.createElement('li');
      li.textContent = 'No failures recorded';
      failuresEl.appendChild(li);
      return;
    }

    list.forEach(item => {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = item.host;
      li.appendChild(cb);

      const span = document.createElement('span');
      const ts = new Date(item.lastSeen).toLocaleString();
      const hitsText = item.hits > 1 ? ` (${item.hits}x)` : '';
      span.textContent = `${item.host} - ${item.lastError} - ${ts}${hitsText}`;
      li.appendChild(span);

      failuresEl.appendChild(li);
    });
  }

  function refresh() {
    log('Requesting failed hosts');
    const startTime = performance.now();

    chrome.runtime.sendMessage({ type: 'GET_FAILED_HOSTS' }, list => {
      if (chrome.runtime.lastError) {
        log('GET_FAILED_HOSTS error:', chrome.runtime.lastError);
        setStatus('Error loading failures', true);
        return;
      }

      const endTime = performance.now();
      current = list || [];
      log('Received hosts:', current.length, 'in', Math.round(endTime - startTime), 'ms');
      render();
    });
  }

  selectAllBtn.addEventListener('click', () => {
    const count = failuresEl.querySelectorAll('input[type=checkbox]').length;
    failuresEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
    log('Select all clicked, selected', count, 'items');
  });

  clearBtn.addEventListener('click', () => {
    const count = failuresEl.querySelectorAll('input[type=checkbox]:checked').length;
    failuresEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    log('Clear selection clicked, cleared', count, 'selections');
  });

  clearAllBtn.addEventListener('click', () => {
    if (!current.length) {
      setStatus('No failures to clear');
      return;
    }

    if (!confirm(`Are you sure you want to clear all ${current.length} failures?`)) {
      return;
    }

    log('Clear all clicked, clearing', current.length, 'failures');
    setStatus('Clearing...');

    chrome.runtime.sendMessage({ type: 'CLEAR_FAILED_HOSTS' }, res => {
      if (chrome.runtime.lastError) {
        log('CLEAR_FAILED_HOSTS error:', chrome.runtime.lastError);
        setStatus('Error clearing failures', true);
        return;
      }

      if (res && res.ok) {
        current = [];
        render();
        setStatus(`Cleared ${res.countCleared} failures`);
        log('Clear all result:', res);
      } else {
        setStatus('Failed to clear failures', true);
      }
    });
  });

  filterInput.addEventListener('input', () => {
    const filter = filterInput.value.trim().toLowerCase();
    log('Filter changed:', filter);
    render();
  });

  addSelectedBtn.addEventListener('click', () => {
    const domains = Array.from(failuresEl.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
    if (!domains.length) {
      setStatus('No domains selected');
      return;
    }

    const currentTraceId = ++traceId;
    log('Add selected clicked:', domains, 'trace:', currentTraceId);
    setStatus('Sending...');
    addSelectedBtn.disabled = true;

    chrome.runtime.sendMessage({ type: 'ADD_TO_PROXY', domains }, res => {
      addSelectedBtn.disabled = false;

      if (chrome.runtime.lastError) {
        log('ADD_TO_PROXY error:', chrome.runtime.lastError, 'trace:', currentTraceId);
        setStatus('Error sending domains', true);
        return;
      }

      if (!res) {
        setStatus('Failed to send domains', true);
        return;
      }

      const successful = res.filter(r => r.ok);
      const failed = res.filter(r => !r.ok);

      log('Add selected result:', { successful: successful.length, failed: failed.length }, 'trace:', currentTraceId);

      if (successful.length > 0) {
        // Prune successful domains
        const successfulDomains = successful.map(r => r.domain);
        log('Pruning successful domains:', successfulDomains, 'trace:', currentTraceId);

        chrome.runtime.sendMessage({
          type: 'PRUNE_FAILED_HOSTS',
          hosts: successfulDomains
        }, pruneRes => {
          if (pruneRes && pruneRes.ok) {
            log('Prune result:', pruneRes, 'trace:', currentTraceId);
            refresh(); // Refresh the list
          }
        });
      }

      const statusMsg = `Added ${successful.length}, failed ${failed.length}`;
      setStatus(statusMsg, failed.length > 0);
    });
  });

  manualAddBtn.addEventListener('click', () => {
    const domain = manualInput.value.trim();
    if (!domain) return;

    const currentTraceId = ++traceId;
    log('Manual add clicked:', domain, 'trace:', currentTraceId);
    setStatus('Sending...');
    manualAddBtn.disabled = true;

    chrome.runtime.sendMessage({ type: 'ADD_TO_PROXY', domains: [domain] }, res => {
      manualAddBtn.disabled = false;

      if (chrome.runtime.lastError) {
        log('Manual add error:', chrome.runtime.lastError, 'trace:', currentTraceId);
        setStatus('Error adding domain', true);
        return;
      }

      if (res && res[0] && res[0].ok) {
        setStatus(`Added ${domain}`);
        manualInput.value = '';

        // Prune the successfully added domain if it exists in the list
        log('Pruning manual domain:', domain, 'trace:', currentTraceId);
        chrome.runtime.sendMessage({
          type: 'PRUNE_FAILED_HOSTS',
          hosts: [domain]
        }, pruneRes => {
          if (pruneRes && pruneRes.ok) {
            log('Manual domain prune result:', pruneRes, 'trace:', currentTraceId);
            refresh();
          }
        });
      } else {
        setStatus(`Failed to add ${domain}`, true);
      }
    });
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'failed_hosts_updated') {
      log('Received failed_hosts_updated broadcast');
      refresh();
    }
  });

  log('Popup initialized');
  refresh();
})();
