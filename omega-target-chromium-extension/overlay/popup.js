(function() {
  const failuresEl = document.getElementById('failures');
  const selectAllBtn = document.getElementById('select-all');
  const clearBtn = document.getElementById('clear-selection');
  const filterInput = document.getElementById('filter');
  const addSelectedBtn = document.getElementById('add-selected');
  const statusEl = document.getElementById('status');
  const manualInput = document.getElementById('manual-domain');
  const manualAddBtn = document.getElementById('manual-add');

  let current = [];

  function setStatus(msg) {
    statusEl.textContent = msg;
    if (msg) {
      setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ''; }, 5000);
    }
  }

  function render() {
    const filter = filterInput.value.trim().toLowerCase();
    failuresEl.innerHTML = '';
    const list = current.filter(item => item.host.includes(filter));
    list.forEach(item => {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = item.host;
      li.appendChild(cb);
      const span = document.createElement('span');
      const ts = new Date(item.lastSeen).toLocaleString();
      span.textContent = item.host + ' - ' + item.lastError + ' - ' + ts;
      li.appendChild(span);
      failuresEl.appendChild(li);
    });
    if (!list.length) {
      const li = document.createElement('li');
      li.textContent = 'No failures recorded';
      failuresEl.appendChild(li);
    }
  }

  function refresh() {
    chrome.runtime.sendMessage({ type: 'GET_FAILED_HOSTS' }, list => {
      current = (list || []).sort((a, b) => b.lastSeen - a.lastSeen);
      render();
    });
  }

  selectAllBtn.addEventListener('click', () => {
    failuresEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
  });

  clearBtn.addEventListener('click', () => {
    failuresEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
  });

  filterInput.addEventListener('input', render);

  addSelectedBtn.addEventListener('click', () => {
    const domains = Array.from(failuresEl.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
    if (!domains.length) {
      setStatus('No domains selected');
      return;
    }
    setStatus('Sending...');
    chrome.runtime.sendMessage({ type: 'ADD_TO_PROXY', domains }, res => {
      if (!res) {
        setStatus('Failed to send');
        return;
      }
      const ok = res.filter(r => r.ok).length;
      const fail = res.length - ok;
      setStatus('Added ' + ok + ', failed ' + fail);
    });
  });

  manualAddBtn.addEventListener('click', () => {
    const domain = manualInput.value.trim();
    if (!domain) return;
    setStatus('Sending...');
    chrome.runtime.sendMessage({ type: 'ADD_TO_PROXY', domains: [domain] }, res => {
      if (res && res[0] && res[0].ok) {
        setStatus('Added ' + domain);
        manualInput.value = '';
      } else {
        setStatus('Failed to add ' + domain);
      }
    });
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'failed_hosts_updated') {
      refresh();
    }
  });

  refresh();
})();
