(function () {
  const WATCHLIST_KEY = 'optioncharts_watchlist';
  const MAX_WATCHLIST = 30;

  // Placeholder row when watchlist is empty (shows table structure only)
  const EMPTY_TABLE_ROW = {
    symbol: '—',
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

  function getWatchlist() {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      const list = raw ? JSON.parse(raw) : ['AVAV'];
      return Array.isArray(list) ? list.slice(0, MAX_WATCHLIST) : ['AVAV'];
    } catch {
      return ['AVAV'];
    }
  }

  function setWatchlist(list) {
    const trimmed = list.slice(0, MAX_WATCHLIST);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(trimmed));
    return trimmed;
  }

  function isTickerLike(s) {
    const t = (s || '').trim().toUpperCase();
    return t.length >= 1 && t.length <= 6 && /^[A-Z0-9.-]+$/.test(t) && t !== '—';
  }

  function renderTable(rows) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
      rows = [EMPTY_TABLE_ROW];
    }
    tbody.innerHTML = rows
      .map(
        (r) => {
          const sym = (r.symbol || r.ticker || '').toString().trim().toUpperCase();
          const symbolCell = isTickerLike(sym)
            ? `<a href="#/symbol/${escapeHtml(sym)}" class="symbol-link">${escapeHtml(sym)}</a>`
            : escapeHtml(r.symbol ?? '—');
          return `
      <tr>
        <td class="symbol">${symbolCell}</td>
        <td>${escapeHtml(percentNoDecimals(r.IVR))}</td>
        <td>${escapeHtml(cellValue(r.TOI))}</td>
        <td class="num ${changeClass(r.toiChangePct)}">${escapeHtml(percentNoDecimals(r.toiChangePct))}</td>
        <td>${escapeHtml(cellValue(r.PCRO))}</td>
        <td>${escapeHtml(percentNoDecimals(r.TOA))}</td>
        <td>${escapeHtml(cellValue(r.TV))}</td>
        <td class="num ${changeClass(r.tvChangePct)}">${escapeHtml(percentNoDecimals(r.tvChangePct))}</td>
        <td>${escapeHtml(cellValue(r.PCRV))}</td>
        <td>${escapeHtml(percentNoDecimals(r.TVA))}</td>
      </tr>
    `;
        }
      )
      .join('');
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
          await fetch(`/api/options/${encodeURIComponent(symbol)}/snapshots`, { method: 'DELETE' });
        } catch (_) {}
        const next = getWatchlist().filter((s) => s !== symbol);
        setWatchlist(next);
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
    return { symbol, IVR: '—', TOI: '—', toiChangePct: '—', PCRO: '—', TOA: '—', TV: '—', tvChangePct: '—', PCRV: '—', TVA: '—' };
  }

  function normalizeTableRow(r, symbol) {
    const sym = (r && (r.symbol || r.ticker)) || symbol;
    return {
      symbol: sym != null && String(sym).trim() !== '' ? String(sym).trim().toUpperCase() : symbol,
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
      const res = await fetch(`/api/table?${params}`);
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

  function bindUpdate() {
    const btn = document.getElementById('btnUpdate');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      const list = getWatchlist();
      if (list.length === 0) return;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Updating…';
      for (const symbol of list) {
        try {
          await fetch(`/api/options/${encodeURIComponent(symbol)}`);
        } catch (_) {
          // continue with other symbols
        }
      }
      await fetchTable();
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
      input.value = '';
      renderWatchlist();
      fetchTable();
    }
    btn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAdd();
    });
  }

  function bindPortfolioSwitch() {
    document.querySelectorAll('.portfolio-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.portfolio-btn').forEach(function (b) {
          b.classList.remove('is-selected');
          b.setAttribute('aria-pressed', 'false');
        });
        this.classList.add('is-selected');
        this.setAttribute('aria-pressed', 'true');
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
      tbody.innerHTML = '<tr><td colspan="10" class="empty-records">No scrape records yet.</td></tr>';
      return;
    }
    tbody.innerHTML = records
      .map((r) => {
        const date = (r._day || (r.timestamp || '').slice(0, 10));
        const isTimed = (r._source || (r.source === 'scheduled' ? 'Timed' : 'Manual') || '').toLowerCase().startsWith('t');
        const dateLabel = date ? `${date} ${isTimed ? 'T' : 'M'}` : '—';
        return `
      <tr>
        <td>${escapeHtml(dateLabel)}</td>
        <td>${escapeHtml(percentNoDecimals(r.IVR))}</td>
        <td>${escapeHtml(cellValue(r.TOI))}</td>
        <td class="num">—</td>
        <td>${escapeHtml(cellValue(r.PCRO))}</td>
        <td>${escapeHtml(percentNoDecimals(r.TOA))}</td>
        <td>${escapeHtml(cellValue(r.TV))}</td>
        <td class="num">—</td>
        <td>${escapeHtml(cellValue(r.PCRV))}</td>
        <td>${escapeHtml(percentNoDecimals(r.TVA))}</td>
      </tr>
    `;
      })
      .join('');
  }

  async function fetchSymbolDaily(symbol) {
    try {
      const res = await fetch(`/api/options/${encodeURIComponent(symbol)}/snapshots/daily?limit=60`);
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

  function init() {
    renderWatchlist();
    fetchTable();
    bindUpdate();
    bindAdd();
    bindPortfolioSwitch();
    bindBackLink();
    route();
    window.addEventListener('hashchange', route);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
