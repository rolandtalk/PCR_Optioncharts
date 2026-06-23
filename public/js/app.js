(function () {
  const WATCHLIST_KEY = 'pcr_tracker_watchlist';
  const WATCHLIST_DAYS = 60;
  const WATCHLIST_MAX_RATIO = 2.0;
  const MAIN_60D_MAX_RATIO = 2.0;
  const DEFAULT_SYMBOL = 'AAPL';
  const CHART = {
    width: 720,
    height: 280,
    left: 42,
    right: 700,
    top: 18,
    bottom: 242,
    minRatio: 0.5,
    maxRatio: 1.4,
    threshold: 1.0,
  };

  const sampleSeries = [
    { date: '2026-05-25', ratio: 0.72 },
    { date: '2026-05-26', ratio: 0.76 },
    { date: '2026-05-27', ratio: 0.84 },
    { date: '2026-05-28', ratio: 0.91 },
    { date: '2026-05-29', ratio: 1.05 },
    { date: '2026-06-01', ratio: 0.96 },
    { date: '2026-06-02', ratio: 0.82 },
    { date: '2026-06-03', ratio: 0.78 },
    { date: '2026-06-04', ratio: 0.69 },
    { date: '2026-06-05', ratio: 0.63 },
    { date: '2026-06-08', ratio: 0.88 },
    { date: '2026-06-09', ratio: 1.14 },
    { date: '2026-06-10', ratio: 1.09 },
    { date: '2026-06-11', ratio: 1.03 },
    { date: '2026-06-12', ratio: 1.01 },
    { date: '2026-06-15', ratio: 1.12 },
    { date: '2026-06-16', ratio: 1.26 },
    { date: '2026-06-17', ratio: 1.08 },
    { date: '2026-06-18', ratio: 0.92 },
    { date: '2026-06-19', ratio: 1.04 },
  ];

  let apiBase = '';
  let selectedDays = 20;
  let currentSymbol = DEFAULT_SYMBOL;
  let currentSeries = sampleSeries;
  let currentHasLiveData = false;

  const $ = (selector) => document.querySelector(selector);

  async function init() {
    await loadConfig();
    bindNavigation();
    bindControls();
    renderChart(currentSymbol, currentSeries, selectedDays);
    updateStats(currentSeries);
    updateAddButton();
    renderWatchlist();
    hydrateWatchlistFromServer();
  }

  async function loadConfig() {
    try {
      const response = await fetch('/config.json', { cache: 'no-store' });
      const config = await response.json();
      if (location.hostname.includes('pages.dev') && config.railwayUrl) {
        apiBase = config.railwayUrl.replace(/\/$/, '');
      } else if (config.apiBase) {
        apiBase = config.apiBase.replace(/\/$/, '');
      }
    } catch (_) {
      apiBase = '';
    }
  }

  function apiUrl(path) {
    return apiBase + path;
  }

  function bindNavigation() {
    document.querySelectorAll('[data-view-link]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        showView(link.dataset.viewLink);
      });
    });
  }

  function showView(viewId) {
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
    document.querySelectorAll('[data-view-link]').forEach((link) => link.classList.toggle('active', link.dataset.viewLink === viewId));
    history.replaceState(null, '', '#' + viewId);
    if (viewId === 'watchlist-page') renderWatchlist();
  }

  function bindControls() {
    document.querySelectorAll('.segment').forEach((button) => {
      button.addEventListener('click', () => {
        selectedDays = Number(button.dataset.days || 20);
        document.querySelectorAll('.segment').forEach((b) => b.classList.toggle('active', b === button));
        renderChart(currentSymbol, currentSeries, selectedDays);
      });
    });

    $('#drawBtn').addEventListener('click', drawRequestedSymbol);
    $('#addBtn').addEventListener('click', addCurrentSymbol);
    $('#sortSelect').addEventListener('change', renderWatchlist);
    $('#refreshWatchBtn').addEventListener('click', refreshWatchlist);
    $('#symbolInput').addEventListener('input', () => {
      $('#symbolInput').value = cleanSymbol($('#symbolInput').value);
      updateAddButton();
    });
  }

  async function drawRequestedSymbol() {
    const symbol = cleanSymbol($('#symbolInput').value) || DEFAULT_SYMBOL;
    currentSymbol = symbol;
    setStatus('Loading', 'loading');
    setButtonsBusy(true);
    try {
      currentSeries = await fetchSeries(symbol, selectedDays);
      currentHasLiveData = true;
      renderChart(symbol, currentSeries, selectedDays);
      updateStats(currentSeries);
      setStatus('Updated', '');
    } catch (error) {
      currentSeries = [];
      currentHasLiveData = false;
      renderChart(symbol, currentSeries, selectedDays);
      updateStats(currentSeries);
      setStatus('Live unavailable', 'error');
    } finally {
      setButtonsBusy(false);
      updateAddButton();
    }
  }

  async function fetchSeries(symbol, days) {
    const optionChartsSeries = await fetchOptionChartsSeries(symbol, days);
    if (optionChartsSeries.length < 2) throw new Error('Not enough OptionCharts PCR records');
    return optionChartsSeries;
  }

  async function fetchOptionChartsSeries(symbol, days) {
    const response = await fetch(apiUrl(`/api/pcr/${encodeURIComponent(symbol)}?days=${encodeURIComponent(days)}`), { cache: 'no-store' });
    if (!response.ok) throw new Error('OptionCharts PCR request failed');
    const payload = await response.json();
    const points = Array.isArray(payload.points) ? payload.points : [];
    return points
      .map((point) => ({
        date: point.date,
        ratio: parseRatio(point.PCRO ?? point.PCRV),
      }))
      .filter((point) => point.date && Number.isFinite(point.ratio));
  }

  function parseRatio(value) {
    const ratio = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(ratio) ? ratio : NaN;
  }

  function renderChart(symbol, series, days) {
    const visible = series.slice(-days);
    const svg = $('#mainChart');
    const chartBox = mainChartBox(days);
    const points = toPoints(visible, chartBox);
    const path = pointsToPath(points);
    const thresholdY = ratioToY(CHART.threshold, chartBox);
    const latest = points[points.length - 1];
    const title = $('#chart-title');

    title.textContent = `${symbol} · Last ${Math.min(days, visible.length)} records`;
    svg.innerHTML = `
      <defs>
        <clipPath id="above-one-main"><rect x="0" y="0" width="${CHART.width}" height="${thresholdY}" /></clipPath>
        <clipPath id="below-one-main"><rect x="0" y="${thresholdY}" width="${CHART.width}" height="${CHART.height - thresholdY}" /></clipPath>
      </defs>
      <line class="axis" x1="${CHART.left}" y1="${CHART.top}" x2="${CHART.left}" y2="${CHART.bottom}" />
      <line class="axis" x1="${CHART.left}" y1="${CHART.bottom}" x2="${CHART.right}" y2="${CHART.bottom}" />
      <line class="threshold" x1="${CHART.left}" y1="${thresholdY}" x2="${CHART.right}" y2="${thresholdY}" />
      <text class="threshold-label" x="58" y="${thresholdY - 10}">1.0</text>
      <text x="8" y="32" fill="#94a3b8" font-size="13">${chartBox.maxRatio.toFixed(1)}</text>
      <text x="8" y="${thresholdY}" fill="#94a3b8" font-size="13">1.0</text>
      <text x="8" y="238" fill="#94a3b8" font-size="13">0.5</text>
      <path class="curve curve-above" clip-path="url(#above-one-main)" d="${path}" />
      <path class="curve curve-below" clip-path="url(#below-one-main)" d="${path}" />
      ${latest ? `<circle class="dot" cx="${latest.x}" cy="${latest.y}" r="6" />` : ''}
    `;
    renderAxisLabels(visible);
    renderMoodMeter(visible);
  }

  function mainChartBox(days) {
    return {
      ...CHART,
      maxRatio: Number(days) === 60 ? MAIN_60D_MAX_RATIO : CHART.maxRatio,
    };
  }

  function renderMoodMeter(series) {
    const mood = getMood(series);
    $('#callMoodFill').style.width = `${mood.callPct}%`;
    $('#putMoodFill').style.width = `${mood.putPct}%`;
    $('#callMoodPct').textContent = `${mood.callPct.toFixed(1)}% Call days`;
    $('#putMoodPct').textContent = `${mood.putPct.toFixed(1)}% Put days`;
  }

  function getMood(series) {
    const valid = series.filter((point) => Number.isFinite(point.ratio));
    const callDays = valid.filter((point) => point.ratio < CHART.threshold).length;
    const putDays = valid.filter((point) => point.ratio >= CHART.threshold).length;
    const total = Math.max(valid.length, 1);
    return {
      callDays,
      putDays,
      callPct: (callDays / total) * 100,
      putPct: (putDays / total) * 100,
    };
  }

  function renderMiniChart(container, series) {
    const miniBox = {
      width: 260,
      height: 100,
      left: 4,
      right: 256,
      top: 8,
      bottom: 90,
      minRatio: CHART.minRatio,
      maxRatio: WATCHLIST_MAX_RATIO,
    };
    const points = toPoints(series.slice(-WATCHLIST_DAYS), miniBox);
    const thresholdY = ratioToY(CHART.threshold, miniBox);
    const path = pointsToPath(points);
    container.innerHTML = `
      <defs>
        <clipPath id="above-${container.dataset.symbol}"><rect x="0" y="0" width="260" height="${thresholdY}" /></clipPath>
        <clipPath id="below-${container.dataset.symbol}"><rect x="0" y="${thresholdY}" width="260" height="${100 - thresholdY}" /></clipPath>
      </defs>
      <line class="threshold" x1="4" y1="${thresholdY}" x2="256" y2="${thresholdY}" />
      <path class="curve curve-above" clip-path="url(#above-${container.dataset.symbol})" d="${path}" />
      <path class="curve curve-below" clip-path="url(#below-${container.dataset.symbol})" d="${path}" />
    `;
  }

  function renderMiniMood(container, series) {
    const mood = getMood(series);
    container.innerHTML = `
      <div class="mini-mood-bar" aria-hidden="true">
        <div class="mini-mood-fill call" style="width: ${mood.callPct}%"></div>
        <div class="mini-mood-fill put" style="width: ${mood.putPct}%"></div>
      </div>
      <div class="mini-mood-values">
        <span>${mood.callPct.toFixed(0)}% Call</span>
        <span>${mood.putPct.toFixed(0)}% Put</span>
      </div>
    `;
  }

  function toPoints(series, box = CHART) {
    const span = Math.max(series.length - 1, 1);
    return series.map((point, index) => ({
      x: box.left + ((box.right - box.left) * index) / span,
      y: ratioToY(point.ratio, box),
      ratio: point.ratio,
      date: point.date,
    }));
  }

  function ratioToY(ratio, box = CHART) {
    const clamped = Math.min(box.maxRatio, Math.max(box.minRatio, ratio));
    const pct = (clamped - box.minRatio) / (box.maxRatio - box.minRatio);
    return box.bottom - pct * (box.bottom - box.top);
  }

  function pointsToPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  }

  function renderAxisLabels(series) {
    const labels = $('#axisLabels');
    if (!series.length) {
      labels.innerHTML = '<span>—</span><span>—</span><span>—</span><span>—</span>';
      return;
    }
    const picks = [0, Math.floor(series.length / 3), Math.floor((series.length * 2) / 3), series.length - 1];
    labels.innerHTML = picks.map((index) => `<span>${formatShortDate(series[index]?.date)}</span>`).join('');
  }

  function updateStats(series) {
    const values = series.map((point) => point.ratio).filter(Number.isFinite);
    if (!values.length) {
      $('#latestRatio').textContent = '—';
      $('#highRatio').textContent = '—';
      $('#lowRatio').textContent = '—';
      return;
    }
    const latest = values[values.length - 1];
    $('#latestRatio').textContent = formatRatio(latest);
    $('#highRatio').textContent = formatRatio(Math.max(...values));
    $('#lowRatio').textContent = formatRatio(Math.min(...values));
  }

  function getWatchlist() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveWatchlist(list) {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  }

  async function hydrateWatchlistFromServer() {
    try {
      const serverSymbols = await fetchServerWatchlistSymbols();
      const merged = mergeWatchlists(getWatchlist(), serverSymbols);
      const needsSync = symbolListKey(serverSymbols) !== symbolListKey(merged.map((item) => item.symbol));

      if (!watchlistsEqual(merged, getWatchlist())) {
        saveWatchlist(merged);
        renderWatchlist();
        updateAddButton();
      }

      const hydrated = [];
      let changed = false;
      for (const item of merged) {
        if (item.days === WATCHLIST_DAYS && item.series?.length >= WATCHLIST_DAYS) {
          hydrated.push(item);
          continue;
        }

        try {
          const series = await fetchOptionChartsSeries(item.symbol, WATCHLIST_DAYS);
          hydrated.push({
            ...item,
            days: WATCHLIST_DAYS,
            refreshedAt: new Date().toISOString(),
            series: series.slice(-WATCHLIST_DAYS),
            error: '',
          });
        } catch (_) {
          hydrated.push({
            ...item,
            days: WATCHLIST_DAYS,
            error: `${WATCHLIST_DAYS}D OptionCharts unavailable`,
          });
        }
        changed = true;
      }

      if (changed) {
        saveWatchlist(hydrated);
        renderWatchlist();
        updateAddButton();
      }
      if (needsSync) syncServerWatchlist(hydrated);
    } catch (_) {
      // Keep the local watchlist usable when the shared backend is unavailable.
    }
  }

  async function fetchServerWatchlistSymbols() {
    const response = await fetch(apiUrl('/api/watchlists'), { cache: 'no-store' });
    if (!response.ok) throw new Error('Watchlist sync failed');
    const payload = await response.json();
    const symbols = [];
    for (let i = 1; i <= 6; i++) {
      const list = Array.isArray(payload[String(i)]) ? payload[String(i)] : [];
      symbols.push(...list);
    }
    return [...new Set(symbols.map(cleanSymbol).filter(Boolean))].slice(0, 30);
  }

  function mergeWatchlists(localList, serverSymbols) {
    const bySymbol = new Map();
    const now = new Date().toISOString();
    const serverSet = new Set(serverSymbols);
    const serverIsCanonical = serverSymbols.length > 0;

    localList.forEach((item) => {
      const symbol = cleanSymbol(item.symbol);
      if (serverIsCanonical && !serverSet.has(symbol)) return;
      if (!symbol || bySymbol.has(symbol)) return;
      bySymbol.set(symbol, {
        ...item,
        symbol,
        days: WATCHLIST_DAYS,
        builtAt: item.builtAt || now,
      });
    });

    serverSymbols.forEach((symbol) => {
      const clean = cleanSymbol(symbol);
      if (!clean || bySymbol.has(clean)) return;
      bySymbol.set(clean, {
        symbol: clean,
        days: WATCHLIST_DAYS,
        builtAt: now,
        refreshedAt: '',
        series: [],
        error: '',
      });
    });

    return [...bySymbol.values()].slice(0, 30);
  }

  function watchlistsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function symbolListKey(symbols) {
    return [...new Set(symbols.map(cleanSymbol).filter(Boolean))].sort().join('|');
  }

  async function addCurrentSymbol() {
    const symbol = cleanSymbol($('#symbolInput').value) || currentSymbol;
    if (!currentHasLiveData) {
      setStatus('Draw live data first', 'error');
      updateAddButton();
      return;
    }
    const list = getWatchlist();
    if (list.some((item) => item.symbol === symbol)) return;
    setStatus('Loading 60D', 'loading');
    setButtonsBusy(true);
    let series = [];
    let error = '';
    try {
      series = await fetchOptionChartsSeries(symbol, WATCHLIST_DAYS);
      setStatus('Added', '');
    } catch (_) {
      error = `${WATCHLIST_DAYS}D OptionCharts unavailable`;
      setStatus('Added without curve', 'error');
    } finally {
      setButtonsBusy(false);
    }
    list.push({
      symbol,
      days: WATCHLIST_DAYS,
      builtAt: new Date().toISOString(),
      refreshedAt: new Date().toISOString(),
      series: series.slice(-WATCHLIST_DAYS),
      error,
    });
    saveWatchlist(list);
    syncServerWatchlist(list);
    updateAddButton();
    showView('watchlist-page');
  }

  function removeSymbol(symbol) {
    const list = getWatchlist().filter((item) => item.symbol !== symbol);
    saveWatchlist(list);
    syncServerWatchlist(list);
    renderWatchlist();
  }

  function renderWatchlist() {
    const grid = $('#watchGrid');
    const sortDir = $('#sortSelect')?.value || 'desc';
    const list = getWatchlist().sort((a, b) => {
      const result = String(a.builtAt || '').localeCompare(String(b.builtAt || ''));
      return sortDir === 'asc' ? result : -result;
    });

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state">No saved symbols yet.</div>';
      return;
    }

    grid.innerHTML = list.map((item) => `
      <article class="mini-card">
        <button class="remove" type="button" aria-label="Remove ${escapeHtml(item.symbol)}" data-remove="${escapeHtml(item.symbol)}">×</button>
        <div class="mini-symbol">${escapeHtml(item.symbol)}</div>
        <div class="mini-date">Built ${formatDateTime(item.builtAt)} · ${WATCHLIST_DAYS}D</div>
        <svg class="mini-chart" data-symbol="${escapeHtml(item.symbol)}" viewBox="0 0 260 100" preserveAspectRatio="none"></svg>
        <div class="mini-mood" data-mood="${escapeHtml(item.symbol)}" aria-label="${escapeHtml(item.symbol)} call and put day occupancy"></div>
        ${item.error ? `<div class="mini-status">${escapeHtml(item.error)}</div>` : ''}
      </article>
    `).join('');

    grid.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', () => removeSymbol(button.dataset.remove));
    });

    grid.querySelectorAll('.mini-chart').forEach((svg) => {
      const item = list.find((entry) => entry.symbol === svg.dataset.symbol);
      renderMiniChart(svg, item?.series?.length ? item.series.slice(-WATCHLIST_DAYS) : []);
    });

    grid.querySelectorAll('.mini-mood').forEach((meter) => {
      const item = list.find((entry) => entry.symbol === meter.dataset.mood);
      renderMiniMood(meter, item?.series?.length ? item.series.slice(-WATCHLIST_DAYS) : []);
    });
  }

  async function refreshWatchlist() {
    const button = $('#refreshWatchBtn');
    const list = getWatchlist();
    if (!list.length) return;

    button.disabled = true;
    button.classList.add('loading');
    button.innerHTML = '<span aria-hidden="true">↻</span>Refreshing';

    const refreshed = [];
    for (const item of list) {
      try {
        const series = await fetchOptionChartsSeries(item.symbol, WATCHLIST_DAYS);
        refreshed.push({
          ...item,
          days: WATCHLIST_DAYS,
          refreshedAt: new Date().toISOString(),
          series: series.slice(-WATCHLIST_DAYS),
          error: '',
        });
      } catch (_) {
        refreshed.push({
          ...item,
          days: WATCHLIST_DAYS,
          error: `${WATCHLIST_DAYS}D OptionCharts unavailable`,
        });
      }
    }

    saveWatchlist(refreshed);
    syncServerWatchlist(refreshed);
    renderWatchlist();
    button.disabled = false;
    button.classList.remove('loading');
    button.innerHTML = '<span aria-hidden="true">↻</span>Refresh';
  }

  function syncServerWatchlist(list) {
    const symbols = list.map((item) => item.symbol);
    fetch(apiUrl('/api/watchlists'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 1: symbols, 2: [], 3: [], 4: [], 5: [], 6: [] }),
    }).catch(() => {});
  }

  function updateAddButton() {
    const symbol = cleanSymbol($('#symbolInput').value) || currentSymbol;
    const exists = getWatchlist().some((item) => item.symbol === symbol);
    const blocked = !currentHasLiveData || exists;
    $('#addBtn').textContent = exists ? `${symbol} is in Watchlist` : `Add ${symbol} to Watchlist`;
    $('#addBtn').disabled = blocked;
  }

  function setButtonsBusy(isBusy) {
    $('#drawBtn').disabled = isBusy;
    $('#addBtn').disabled = isBusy;
  }

  function setStatus(text, className) {
    const pill = $('#statusPill');
    pill.textContent = text;
    pill.className = `pill ${className || ''}`.trim();
  }

  function makeFallbackSeries(symbol, days) {
    const base = sampleSeries.map((point, index) => ({
      date: point.date,
      ratio: Math.max(0.5, Math.min(1.4, point.ratio + ((symbol.charCodeAt(0) % 7) - 3) * 0.025 + index * 0.003)),
    }));
    if (days <= base.length) return base;
    return base.concat(base.map((point, index) => ({
      date: `2026-06-${String(22 + index).padStart(2, '0')}`,
      ratio: Math.max(0.5, Math.min(1.4, point.ratio + 0.04)),
    }))).slice(-days);
  }

  function cleanSymbol(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 12);
  }

  function formatRatio(value) {
    return Number.isFinite(value) ? value.toFixed(2) : '—';
  }

  function formatShortDate(value) {
    if (!value) return '—';
    const date = new Date(value + 'T12:00:00Z');
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatDateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[char]));
  }

  init();
})();
