(function () {
  const WATCHLIST_KEY_LEGACY = 'optioncharts_watchlist';
  const PORTFOLIO_KEY = 'optioncharts_portfolio';
  const MAX_WATCHLIST = 30;
  const DEFAULT_PORTFOLIO = '1';

  let apiBase = '';
  function getApiUrl(path) {
    return (apiBase || '') + path;
  }

  async function loadConfig() {
    try {
      const r = await fetch('/config.json');
      const c = await r.json();
      if (location.hostname.includes('pages.dev') && c.railwayUrl) {
        apiBase = (c.railwayUrl || '').replace(/\/$/, '');
      } else if (c.apiBase) {
        apiBase = (c.apiBase || '').replace(/\/$/, '');
      }
    } catch (_) {}
    // Fallback when on Cloudflare Pages so API always points to Railway even if config failed
    if (location.hostname.includes('pages.dev') && !apiBase) {
      apiBase = 'https://optionscan.up.railway.app';
    }
  }

  async function seedWatchlistsFromRepo() {
    try {
      const r = await fetch('/data/watchlists.json');
      const data = await r.json();
      for (let i = 1; i <= 6; i++) {
        const key = getWatchlistKey(String(i));
        const existing = localStorage.getItem(key);
        if (!existing || existing === '[]') {
          const list = data[String(i)];
          if (Array.isArray(list)) {
            localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_WATCHLIST)));
          }
        }
      }
    } catch (_) {}
  }

  /** Load watchlists from server (sync across devices). Only overwrite local when server has at least as much data, so stale server never wipes a fuller local list. */
  async function loadWatchlistsFromServer() {
    if (!getApiUrl('/api/watchlists')) return;
    try {
      const r = await fetch(getApiUrl('/api/watchlists'));
      if (!r.ok) return;
      const data = await r.json();
      if (!data || typeof data !== 'object') return;
      let serverTotal = 0;
      for (let i = 1; i <= 6; i++) {
        const list = data[String(i)];
        if (Array.isArray(list)) serverTotal += list.length;
      }
      let localTotal = 0;
      for (let i = 1; i <= 6; i++) {
        localTotal += getWatchlistForPortfolio(String(i)).length;
      }
      if (serverTotal === 0) return;
      if (localTotal > serverTotal) {
        syncWatchlistsToServer();
        return;
      }
      for (let i = 1; i <= 6; i++) {
        const key = String(i);
        const list = Array.isArray(data[key]) ? data[key] : [];
        localStorage.setItem(getWatchlistKey(key), JSON.stringify(list.slice(0, MAX_WATCHLIST)));
      }
    } catch (_) {}
  }

  /** Push current watchlists to server so other devices see the same data. */
  function syncWatchlistsToServer() {
    const payload = {};
    for (let i = 1; i <= 6; i++) {
      payload[String(i)] = getWatchlistForPortfolio(String(i));
    }
    fetch(getApiUrl('/api/watchlists'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  function getWatchlistKey(portfolio) {
    return 'optioncharts_watchlist_' + (portfolio || DEFAULT_PORTFOLIO);
  }

  function getPortfolio() {
    try {
      const p = localStorage.getItem(PORTFOLIO_KEY);
      return p && /^[1-6]$/.test(p) ? p : DEFAULT_PORTFOLIO;
    } catch {
      return DEFAULT_PORTFOLIO;
    }
  }

  function setPortfolio(portfolio) {
    if (portfolio && /^[1-6]$/.test(portfolio)) {
      localStorage.setItem(PORTFOLIO_KEY, portfolio);
    }
  }

  function migrateLegacyWatchlist() {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY_LEGACY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          localStorage.setItem(getWatchlistKey('1'), JSON.stringify(list.slice(0, MAX_WATCHLIST)));
        }
        localStorage.removeItem(WATCHLIST_KEY_LEGACY);
      }
      if (!localStorage.getItem(PORTFOLIO_KEY)) {
        localStorage.setItem(PORTFOLIO_KEY, DEFAULT_PORTFOLIO);
      }
    } catch (_) {}
  }

  function getWatchlistForPortfolio(portfolio) {
    const key = getWatchlistKey(portfolio);
    try {
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : null;
      if (Array.isArray(list)) return list.slice(0, MAX_WATCHLIST);
      return portfolio === '1' ? ['AVAV'] : [];
    } catch {
      return portfolio === '1' ? ['AVAV'] : [];
    }
  }

  function getWatchlist() {
    migrateLegacyWatchlist();
    return getWatchlistForPortfolio(getPortfolio());
  }

  function setWatchlist(list) {
    const portfolio = getPortfolio();
    const trimmed = list.slice(0, MAX_WATCHLIST);
    localStorage.setItem(getWatchlistKey(portfolio), JSON.stringify(trimmed));
    return trimmed;
  }

  // Placeholder row when watchlist is empty (shows table structure only)
  const EMPTY_TABLE_ROW = {
    symbol: '—',
    IV: '—',
    IVR: '—',
    TOI: '—',
    toiChangePct: '—',
    PCRO: '—',
    TOA: '—',
    TV: '—',
    tvChangePct: '—',
    PCRV: '—',
    TVA: '—',
  };

  function isTickerLike(s) {
    const t = (s || '').trim().toUpperCase();
    return t.length >= 1 && t.length <= 6 && /^[A-Z0-9.-]+$/.test(t) && t !== '—';
  }

  let lastTableRows = [];
  let sortState = { key: null, dir: 1 };

  function parseNum(val) {
    if (val == null || String(val).trim() === '' || String(val).trim() === '—') return NaN;
    const n = parseFloat(String(val).replace(/%|,/g, '').replace(/^\+/, '').trim());
    return Number.isNaN(n) ? NaN : n;
  }

  function getSortValue(row, key) {
    const v = row[key];
    if (key === 'symbol') return (v || '').toString().trim().toUpperCase() || '—';
    const num = parseNum(v);
    return Number.isNaN(num) ? null : num;
  }

  function applySort() {
    if (!lastTableRows.length || lastTableRows[0].symbol === '—') return lastTableRows;
    if (!sortState.key) return lastTableRows;
    const key = sortState.key;
    const dir = sortState.dir;
    return lastTableRows.slice().sort((a, b) => {
      const va = getSortValue(a, key);
      const vb = getSortValue(b, key);
      if (key === 'symbol') {
        const c = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });
        return dir * c;
      }
      if (va == null && vb == null) return 0;
      if (va == null) return dir;
      if (vb == null) return -dir;
      return dir * (va - vb);
    });
  }

  function updateSortIcons() {
    document.querySelectorAll('#majorTable thead .sortable').forEach((th) => {
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      const key = th.dataset.sort;
      if (sortState.key === key) {
        icon.textContent = sortState.dir === 1 ? '\u25B2' : '\u25BC';
        icon.setAttribute('aria-label', sortState.dir === 1 ? 'ascending' : 'descending');
      } else {
        icon.textContent = '\u2195';
        icon.setAttribute('aria-label', 'sort');
      }
    });
  }

  function bindTableSort() {
    document.querySelectorAll('#majorTable thead .sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (!key) return;
        if (sortState.key === key) {
          sortState.dir = -sortState.dir;
        } else {
          sortState.key = key;
          sortState.dir = 1;
        }
        renderTable(lastTableRows.length ? applySort() : [EMPTY_TABLE_ROW]);
        updateSortIcons();
      });
    });
  }

  function renderTable(rows) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    if (rows && rows.length > 0 && (rows[0].symbol || '').toString().trim() !== '—') {
      lastTableRows = rows.slice();
    } else {
      lastTableRows = [];
    }
    const toRender = sortState.key && lastTableRows.length ? applySort() : (rows && rows.length ? rows : [EMPTY_TABLE_ROW]);
    const displayRows = toRender.length ? toRender : [EMPTY_TABLE_ROW];
    tbody.innerHTML = displayRows
      .map(
        (r) => {
          const sym = (r.symbol || r.ticker || '').toString().trim().toUpperCase();
          const symbolCell = isTickerLike(sym)
            ? `<a href="#/symbol/${escapeHtml(sym)}" class="symbol-link">${escapeHtml(sym)}</a>`
            : escapeHtml(r.symbol ?? '—');
          const rowAttr = isTickerLike(sym) ? ` data-symbol="${escapeHtml(sym)}"` : '';
          return `
      <tr${rowAttr}>
        <td class="symbol">${symbolCell}</td>
        <td>${escapeHtml(percentNoDecimals(r.IV))}</td>
        <td>${escapeHtml(percentNoDecimals(r.IVR))}</td>
        <td>${escapeHtml(cellValue(r.TOI))}</td>
        <td class="num pct-col ${changeClass(r.toiChangePct)}">${escapeHtml(percentNoDecimals(r.toiChangePct))}</td>
        <td>${escapeHtml(cellValue(r.PCRO))}</td>
        <td>${escapeHtml(percentNoDecimals(r.TOA))}</td>
        <td>${escapeHtml(cellValue(r.TV))}</td>
        <td class="num pct-col ${changeClass(r.tvChangePct)}">${escapeHtml(percentNoDecimals(r.tvChangePct))}</td>
        <td>${escapeHtml(cellValue(r.PCRV))}</td>
        <td>${escapeHtml(percentNoDecimals(r.TVA))}</td>
      </tr>
    `;
        }
      )
      .join('');
    updateSortIcons();
  }

  function changeClass(val) {
    if (val == null || val === '—') return '';
    const n = parseFloat(String(val).replace(/[+%]/g, ''));
    if (Number.isNaN(n)) return '';
    return n >= 0 ? 'change-up' : 'change-down';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function cellValue(val) {
    if (val == null || String(val).trim() === '') return '—';
    return val;
  }

  function percentNoDecimals(val) {
    if (val == null || String(val).trim() === '') return '—';
    const s = String(val).trim();
    const sign = s.startsWith('+') ? '+' : s.startsWith('-') ? '-' : '';
    const n = parseFloat(s.replace(/[+%]/g, '').replace(/,/g, ''));
    if (Number.isNaN(n)) return '—';
    return sign + Math.round(n) + '%';
  }

  function renderWatchlist() {
    const list = getWatchlist();
    const ul = document.getElementById('watchlist');
    const countEl = document.getElementById('watchlistCount');
    if (!ul || !countEl) return;
    countEl.textContent = `${list.length}/${MAX_WATCHLIST}`;
    if (list.length === 0) {
      ul.innerHTML = '<li class="watchlist-empty">No symbols. Add one above.</li>';
      return;
    }
    ul.innerHTML = list
      .map((symbol) => {
        const letter = symbol.charAt(0).toUpperCase();
        return `
      <li data-symbol="${escapeHtml(symbol)}">
        <span class="symbol-icon" aria-hidden="true">${letter}</span>
        <div class="symbol-info">
          <div class="symbol-primary">${escapeHtml(symbol)}</div>
          <div class="symbol-secondary">${symbol}.US</div>
        </div>
        <button type="button" class="btn-deduct" aria-label="Remove ${escapeHtml(symbol)} from watchlist"></button>
      </li>
    `;
      })
      .join('');
    ul.querySelectorAll('.btn-deduct').forEach((btn) => {
      btn.addEventListener('click', async function () {
        const li = this.closest('li');
        const symbol = li && li.dataset.symbol;
        if (!symbol) return;
        try {
          await fetch(getApiUrl(`/api/options/${encodeURIComponent(symbol)}/snapshots`), { method: 'DELETE' });
        } catch (_) {}
        const next = getWatchlist().filter((s) => s !== symbol);
        setWatchlist(next);
        syncWatchlistsToServer();
        if (getSymbolFromHash() === symbol) {
          window.location.hash = '';
        }
        renderWatchlist();
        fetchTable();
      });
    });
  }

  function setLastUpdate(isoOrNull) {
    const el = document.getElementById('lastUpdate');
    if (!el) return;
    if (!isoOrNull) {
      el.textContent = 'Last updated: —';
      return;
    }
    const d = new Date(isoOrNull);
    el.textContent = `Last updated: ${d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`;
  }

  function placeholderRow(symbol) {
    return { symbol, IV: '—', IVR: '—', TOI: '—', toiChangePct: '—', PCRO: '—', TOA: '—', TV: '—', tvChangePct: '—', PCRV: '—', TVA: '—' };
  }

  function normalizeTableRow(r, symbol) {
    const sym = (r && (r.symbol || r.ticker)) || symbol;
    return {
      symbol: sym != null && String(sym).trim() !== '' ? String(sym).trim().toUpperCase() : symbol,
      IV: cellValue(r && r.IV),
      IVR: cellValue(r && r.IVR),
      TOI: cellValue(r && r.TOI),
      toiChangePct: cellValue(r && r.toiChangePct),
      PCRO: cellValue(r && r.PCRO),
      TOA: cellValue(r && r.TOA),
      TV: cellValue(r && r.TV),
      tvChangePct: cellValue(r && r.tvChangePct),
      PCRV: cellValue(r && r.PCRV),
      TVA: cellValue(r && r.TVA),
    };
  }

  async function fetchTable() {
    const list = getWatchlist();
    if (list.length === 0) {
      renderTable([EMPTY_TABLE_ROW]);
      setLastUpdate(null);
      return;
    }
    try {
      const params = new URLSearchParams({ symbols: list.join(',') });
      const res = await fetch(getApiUrl(`/api/table?${params}`));
      if (!res.ok) throw new Error('Table request failed');
      const data = await res.json();
      const apiRows = Array.isArray(data.rows) ? data.rows : [];
      const bySymbol = {};
      for (const r of apiRows) {
        const s = (r.symbol || r.ticker || '').toString().trim().toUpperCase();
        if (s) bySymbol[s] = r;
      }
      const rows = list.map((symbol) => normalizeTableRow(bySymbol[symbol.toUpperCase()], symbol));
      renderTable(rows);
      setLastUpdate(data.lastUpdated || null);
    } catch {
      const listAgain = getWatchlist();
      const fallback = listAgain.map((s) => normalizeTableRow(placeholderRow(s), s));
      renderTable(fallback.length ? fallback : [EMPTY_TABLE_ROW]);
      setLastUpdate(null);
    }
  }

  function formatElapsed(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
  }

  function bindUpdate() {
    const btn = document.getElementById('btnUpdate');
    const timerEl = document.getElementById('updateTimer');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      const list = getWatchlist();
      if (list.length === 0) {
        if (timerEl) {
          timerEl.textContent = 'Add at least one symbol';
          timerEl.classList.add('timer-done');
          setTimeout(() => { timerEl.textContent = ''; timerEl.classList.remove('timer-done'); }, 3000);
        }
        return;
      }
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Updating…';
      const start = Date.now();
      let timerId = null;
      if (timerEl) {
        timerEl.textContent = '0:00';
        timerEl.classList.add('timer-active');
        timerId = setInterval(() => {
          const sec = Math.floor((Date.now() - start) / 1000);
          timerEl.textContent = formatElapsed(sec);
        }, 1000);
      }
      let batchResults = [];
      try {
        const res = await fetch(getApiUrl('/api/options/scrape-batch'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: list }),
        });
        const data = await res.json();
        if (data.results) batchResults = data.results;
      } catch (_) {}
      await fetchTable();
      if (timerId) clearInterval(timerId);
      if (timerEl) {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        timerEl.textContent = `Completed in ${formatElapsed(elapsed)}`;
        timerEl.classList.remove('timer-active');
        timerEl.classList.add('timer-done');
        setTimeout(() => {
          timerEl.textContent = '';
          timerEl.classList.remove('timer-done');
        }, 3000);
      }
      batchResults.forEach((r, i) => {
        const row = document.querySelector(`#majorTable tr[data-symbol="${r.ticker}"]`);
        if (!row) return;
        const cell = row.querySelector('td.symbol');
        if (!cell) return;
        const delay = i * 120;
        setTimeout(() => {
          cell.classList.remove('updated-success', 'updated-fail');
          cell.classList.add(r.ok ? 'updated-success' : 'updated-fail');
          setTimeout(() => cell.classList.remove('updated-success', 'updated-fail'), 4000);
        }, delay);
      });
      btn.textContent = label;
      btn.disabled = false;
    });
  }

  function bindAdd() {
    const input = document.getElementById('addSymbol');
    const btn = document.getElementById('btnAdd');
    if (!input || !btn) return;
    function doAdd() {
      const symbol = (input.value || '').trim().toUpperCase();
      if (!symbol) return;
      const list = getWatchlist();
      if (list.includes(symbol)) {
        input.value = '';
        return;
      }
      if (list.length >= MAX_WATCHLIST) return;
      setWatchlist([...list, symbol]);
      syncWatchlistsToServer();
      input.value = '';
      renderWatchlist();
      fetchTable();
    }
    btn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAdd();
    });
  }

  function applyPortfolioSelection(portfolio) {
    const id = portfolio || getPortfolio();
    document.querySelectorAll('.portfolio-btn').forEach(function (b) {
      const selected = b.dataset.portfolio === id;
      b.classList.toggle('is-selected', selected);
      b.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function bindPortfolioSwitch() {
    document.querySelectorAll('.portfolio-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const portfolio = this.dataset.portfolio;
        if (!portfolio) return;
        setPortfolio(portfolio);
        applyPortfolioSelection(portfolio);
        renderWatchlist();
        fetchTable();
      });
    });
  }

  function getSymbolFromHash() {
    const hash = (window.location.hash || '').replace(/^#\/?/, '');
    const m = /^symbol\/([A-Z0-9.-]+)$/i.exec(hash);
    return m ? m[1].toUpperCase() : null;
  }

  function showView(viewId) {
    const home = document.getElementById('view-home');
    const symbol = document.getElementById('view-symbol');
    if (viewId === 'symbol') {
      if (home) home.classList.add('hidden');
      if (symbol) symbol.classList.remove('hidden');
    } else {
      if (home) home.classList.remove('hidden');
      if (symbol) symbol.classList.add('hidden');
    }
  }

  function renderSymbolRecords(symbol, records) {
    const tbody = document.getElementById('symbolRecordsBody');
    const titleEl = document.getElementById('symbolPageTitle');
    if (titleEl) titleEl.textContent = symbol;
    if (!tbody) return;
    if (!records || records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty-records">No scrape records yet.</td></tr>';
      return;
    }
    function formatDateMMMDD(dayStr) {
      if (!dayStr || dayStr.length !== 10) return '—';
      const d = new Date(dayStr + 'T12:00:00Z');
      const mon = d.toLocaleDateString('en-US', { month: 'short' });
      const day = d.getUTCDate();
      return mon + '-' + String(day).padStart(2, '0');
    }
    function formatTime(ts, source) {
      if (!ts) return '—';
      try {
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return '—';
        const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
        const suffix = (source === 'Timed') ? ' T' : ' M';
        return time + suffix;
      } catch (_) {
        return '—';
      }
    }
    tbody.innerHTML = records
      .map((r) => {
        const date = (r._day || (r.timestamp || '').slice(0, 10));
        const dateLabel = formatDateMMMDD(date);
        const source = r._source || (r.source === 'scheduled' ? 'Timed' : 'Manual');
        const timeLabel = formatTime(r.timestamp, source);
        return `
      <tr>
        <td>${escapeHtml(dateLabel)}</td>
        <td>${escapeHtml(timeLabel)}</td>
        <td>${escapeHtml(percentNoDecimals(r.IV))}</td>
        <td>${escapeHtml(percentNoDecimals(r.IVR))}</td>
        <td>${escapeHtml(cellValue(r.TOI))}</td>
        <td class="num pct-col">${escapeHtml(r._toiChangePct ?? '—')}</td>
        <td>${escapeHtml(cellValue(r.PCRO))}</td>
        <td>${escapeHtml(percentNoDecimals(r.TOA))}</td>
        <td>${escapeHtml(cellValue(r.TV))}</td>
        <td class="num pct-col">${escapeHtml(r._tvChangePct ?? '—')}</td>
        <td>${escapeHtml(cellValue(r.PCRV))}</td>
        <td>${escapeHtml(percentNoDecimals(r.TVA))}</td>
      </tr>
    `;
      })
      .join('');
  }

  async function fetchSymbolDaily(symbol) {
    try {
      const res = await fetch(getApiUrl(`/api/options/${encodeURIComponent(symbol)}/snapshots/daily?limit=60`));
      const data = await res.json();
      if (data.records) {
        renderSymbolRecords(symbol, data.records);
      } else {
        renderSymbolRecords(symbol, []);
      }
    } catch {
      renderSymbolRecords(symbol, []);
    }
  }

  function route() {
    const symbol = getSymbolFromHash();
    if (symbol) {
      showView('symbol');
      fetchSymbolDaily(symbol);
    } else {
      showView('home');
    }
  }

  function bindBackLink() {
    const link = document.getElementById('linkBack');
    if (!link) return;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      window.location.hash = '';
    });
  }

  function bindExportWatchlists() {
    const el = document.getElementById('exportWatchlists');
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      const out = {};
      for (let i = 1; i <= 6; i++) {
        out[String(i)] = getWatchlistForPortfolio(String(i));
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'watchlists.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  async function init() {
    migrateLegacyWatchlist();
    await loadConfig();
    await seedWatchlistsFromRepo();
    await loadWatchlistsFromServer();
    applyPortfolioSelection(getPortfolio());
    renderWatchlist();
    fetchTable();
    bindTableSort();
    bindUpdate();
    bindAdd();
    bindPortfolioSwitch();
    bindBackLink();
    bindExportWatchlists();
    route();
    window.addEventListener('hashchange', route);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
