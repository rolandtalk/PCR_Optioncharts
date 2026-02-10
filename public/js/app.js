(function () {
  const WATCHLIST_KEY = 'optioncharts_watchlist';
  const MAX_WATCHLIST = 30;

  // Prototype: scraped AVAV data (Timed scrape snapshot)
  const PROTOTYPE_ROW = {
    symbol: 'AVAV',
    IVR: '90.49%',
    TOI: '44,984',
    toiChangePct: '—',
    PCRO: '0.86',
    TOA: '95.58%',
    TV: '4,087',
    tvChangePct: '—',
    PCRV: '0.39',
    TVA: '52.17%',
    timestamp: new Date().toISOString(),
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

  function renderTable(rows) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
      rows = [PROTOTYPE_ROW];
    }
    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td class="symbol">${escapeHtml(r.symbol)}</td>
        <td>${escapeHtml(r.IVR ?? '—')}</td>
        <td>${escapeHtml(r.TOI ?? '—')}</td>
        <td class="num ${changeClass(r.toiChangePct)}">${escapeHtml(r.toiChangePct ?? '—')}</td>
        <td>${escapeHtml(r.PCRO ?? '—')}</td>
        <td>${escapeHtml(r.TOA ?? '—')}</td>
        <td>${escapeHtml(r.TV ?? '—')}</td>
        <td class="num ${changeClass(r.tvChangePct)}">${escapeHtml(r.tvChangePct ?? '—')}</td>
        <td>${escapeHtml(r.PCRV ?? '—')}</td>
        <td>${escapeHtml(r.TVA ?? '—')}</td>
      </tr>
    `
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
      btn.addEventListener('click', function () {
        const li = this.closest('li');
        const symbol = li && li.dataset.symbol;
        if (!symbol) return;
        const next = getWatchlist().filter((s) => s !== symbol);
        setWatchlist(next);
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

  async function fetchTable() {
    const list = getWatchlist();
    if (list.length === 0) {
      renderTable([PROTOTYPE_ROW]);
      setLastUpdate(null);
      return;
    }
    try {
      const params = new URLSearchParams({ symbols: list.join(',') });
      const res = await fetch(`/api/table?${params}`);
      const data = await res.json();
      if (data.rows && data.rows.length > 0) {
        renderTable(data.rows);
        setLastUpdate(data.lastUpdated || null);
      } else {
        renderTable(list.includes('AVAV') ? [PROTOTYPE_ROW] : []);
        setLastUpdate(null);
      }
    } catch {
      renderTable(list.includes('AVAV') ? [PROTOTYPE_ROW] : []);
      setLastUpdate(null);
    }
  }

  function bindUpdate() {
    const btn = document.getElementById('btnUpdate');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      await fetchTable();
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

  function init() {
    renderWatchlist();
    fetchTable();
    bindUpdate();
    bindAdd();
    bindPortfolioSwitch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
