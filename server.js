/**
 * OptionCharts scraper API
 * - Manual: GET /api/options/:ticker
 * - Scheduled: 20:50 Taiwan time (12:50 UTC) on Mon–Fri, scrapes configured tickers and stores
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { scrapeOptions, scrapeMultiple } from './lib/scraper.js';
import { appendSnapshot, getSnapshots, deleteSnapshots, loadWatchlists, saveWatchlists, DATA_DIR } from './lib/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Tickers to scrape on schedule (comma-separated env, default AVAV)
const SCHEDULED_TICKERS = (process.env.SCHEDULED_TICKERS || 'AVAV')
  .split(',')
  .map((t) => t.trim().toUpperCase())
  .filter(Boolean);

// 20:50 Taiwan time = 12:50 UTC (Taiwan UTC+8). Mon–Fri = trading days.
const CRON_20_50_TAIWAN = '50 12 * * 1-5';

app.use(express.json());

// CORS: allow frontend on Cloudflare Pages (optionscan.pages.dev and preview subdomains)
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (origin === 'https://optionscan.pages.dev' || /^https:\/\/[a-z0-9-]+\.optionscan\.pages\.dev$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(join(__dirname, 'public')));

// Health for Railway

app.get('/health', (req, res) => res.send('ok'));

/**
 * Get saved watchlists (sync across devices). Shape: { "1": [...], "2": [...], ... "6": [] }
 */
app.get('/api/watchlists', (req, res) => {
  try {
    const data = loadWatchlists();
    res.json(data);
  } catch (e) {
    console.error('Load watchlists failed:', e);
    res.status(500).json({ error: 'Failed to load watchlists' });
  }
});

/**
 * Save watchlists (sync across devices). Body: { "1": [...], "2": [...], ... "6": [] }
 */
app.post('/api/watchlists', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    saveWatchlists(body);
    res.json(loadWatchlists());
  } catch (e) {
    console.error('Save watchlists failed:', e);
    res.status(500).json({ error: 'Failed to save watchlists' });
  }
});

/**
 * Manual trigger: scrape :ticker and return metrics.
 * Order: IVR, TOI, PCRO, TOA, TV, PCRV, TVA
 */
app.get('/api/options/:ticker', async (req, res) => {
  const ticker = (req.params.ticker || '').toUpperCase();
  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker' });
  }
  try {
    const data = await scrapeOptions(ticker);
    const record = { ...data, timestamp: new Date().toISOString(), source: 'manual' };
    appendSnapshot(record);
    res.json(record);
  } catch (e) {
    console.error('Scrape failed:', e);
    res.status(502).json({ error: 'Scrape failed', message: e.message });
  }
});

/**
 * Batch scrape: run multiple symbols in parallel (one browser, up to 5 pages at a time).
 * POST /api/options/scrape-batch body: { symbols: ['AVAV', 'SMCI', ...] }
 */
app.post('/api/options/scrape-batch', async (req, res) => {
  const symbols = Array.isArray(req.body.symbols)
    ? req.body.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
    : [];
  if (symbols.length === 0) {
    return res.status(400).json({ error: 'Missing or empty symbols' });
  }
  try {
    const results = await scrapeMultiple(symbols);
    const timestamp = new Date().toISOString();
    const saved = [];
    for (const r of results) {
      if (r.data) {
        const record = { ...r.data, timestamp, source: 'manual' };
        appendSnapshot(record);
        saved.push({ ticker: r.ticker, ok: true });
      } else {
        saved.push({ ticker: r.ticker, ok: false, error: r.error });
      }
    }
    res.json({ results: saved });
  } catch (e) {
    console.error('Batch scrape failed:', e);
    console.error('Batch scrape stack:', e.stack);
    res.status(502).json({
      error: 'Batch scrape failed',
      message: e && (e.message || String(e)),
    });
  }
});

/**
 * Daily view: at most 2 records per day — one scheduled (timed), one manual (latest only).
 * % columns: compare to previous day's Timed scrape; if none, show "—".
 * GET /api/options/:ticker/snapshots/daily?limit=60
 */
function prevDayStr(dayStr) {
  const d = new Date(dayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

app.get('/api/options/:ticker/snapshots/daily', (req, res) => {
  const ticker = (req.params.ticker || '').toUpperCase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker' });
  }
  const list = getSnapshots(ticker, 500);
  const byDay = {};
  for (const s of list) {
    const ts = s.timestamp || '';
    const day = ts.slice(0, 10);
    if (!day || day.length !== 10) continue;
    if (!byDay[day]) byDay[day] = { scheduled: null, manual: null };
    if (s.source === 'scheduled' && !byDay[day].scheduled) byDay[day].scheduled = s;
    if (s.source === 'manual') {
      if (!byDay[day].manual || s.timestamp > byDay[day].manual.timestamp) byDay[day].manual = s;
    }
  }
  const days = Object.keys(byDay).sort().reverse().slice(0, limit);
  const records = [];
  for (const day of days) {
    const { scheduled, manual } = byDay[day];
    const prevTimed = byDay[prevDayStr(day)]?.scheduled;
    const pctFromPrev = (r) => {
      let toi = '—';
      let tv = '—';
      if (prevTimed) {
        const toiNum = parseNumber(r.TOI);
        const tvNum = parseNumber(r.TV);
        const prevToi = parseNumber(prevTimed.TOI);
        const prevTv = parseNumber(prevTimed.TV);
        if (prevToi != null && prevToi !== 0 && toiNum != null) toi = (Math.round(((toiNum - prevToi) / prevToi) * 100) >= 0 ? '+' : '') + Math.round(((toiNum - prevToi) / prevToi) * 100) + '%';
        if (prevTv != null && prevTv !== 0 && tvNum != null) tv = (Math.round(((tvNum - prevTv) / prevTv) * 100) >= 0 ? '+' : '') + Math.round(((tvNum - prevTv) / prevTv) * 100) + '%';
      }
      return { toi, tv };
    };
    if (scheduled) {
      const { toi, tv } = pctFromPrev(scheduled);
      records.push({ ...scheduled, _day: day, _source: 'Timed', _toiChangePct: toi, _tvChangePct: tv });
    }
    if (manual) {
      const { toi, tv } = pctFromPrev(manual);
      records.push({ ...manual, _day: day, _source: 'Manual', _toiChangePct: toi, _tvChangePct: tv });
    }
  }
  records.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  res.json({ ticker, count: records.length, records });
});

/**
 * Stored snapshots for a ticker (from manual + scheduled runs).
 */
app.get('/api/options/:ticker/snapshots', (req, res) => {
  const ticker = (req.params.ticker || '').toUpperCase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker' });
  }
  const list = getSnapshots(ticker, limit);
  res.json({ ticker, count: list.length, snapshots: list });
});

/**
 * Delete all stored snapshots for a ticker (e.g. when user removes symbol from watchlist).
 */
app.delete('/api/options/:ticker/snapshots', (req, res) => {
  const ticker = (req.params.ticker || '').toUpperCase();
  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker' });
  }
  deleteSnapshots(ticker);
  res.json({ ticker, deleted: true });
});

/**
 * Table data for Major Table.
 * Rule: show the last-updated snapshot per symbol (timed or manual). TOI/TV change % use previous snapshot.
 * GET /api/table?symbols=AVAV,TSLA
 */
app.get('/api/table', (req, res) => {
  const raw = (req.query.symbols || '').trim();
  const symbols = raw ? raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : [];
  if (symbols.length === 0) {
    return res.json({ rows: [], lastUpdated: null });
  }
  const rows = [];
  let lastUpdated = null;
  for (const symbol of symbols) {
    const snapshots = getSnapshots(symbol, 50);
    const latest = snapshots[0];
    const prev = snapshots[1];
    if (!latest) {
      rows.push({
        symbol,
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
        timestamp: null,
      });
      continue;
    }
    const toiNum = parseNumber(latest.TOI);
    const tvNum = parseNumber(latest.TV);
    const prevToi = prev ? parseNumber(prev.TOI) : null;
    const prevTv = prev ? parseNumber(prev.TV) : null;
    let toiChangePct = null;
    let tvChangePct = null;
    if (prevToi != null && prevToi !== 0) toiChangePct = Math.round(((toiNum - prevToi) / prevToi) * 100);
    if (prevTv != null && prevTv !== 0) tvChangePct = Math.round(((tvNum - prevTv) / prevTv) * 100);
    if (latest.timestamp && (!lastUpdated || latest.timestamp > lastUpdated)) lastUpdated = latest.timestamp;
    const dash = (v) => (v != null && String(v).trim() !== '' ? String(v) : '—');
    const pct = percentNoDecimals;
    const sym = (latest.ticker || latest.symbol || symbol || '').toString().trim().toUpperCase() || symbol;
    rows.push({
      symbol: sym,
      IV: pct(latest.IV),
      IVR: pct(latest.IVR),
      TOI: dash(latest.TOI),
      toiChangePct: toiChangePct != null ? (toiChangePct >= 0 ? '+' : '') + toiChangePct + '%' : '—',
      PCRO: dash(latest.PCRO),
      TOA: pct(latest.TOA),
      TV: dash(latest.TV),
      tvChangePct: tvChangePct != null ? (tvChangePct >= 0 ? '+' : '') + tvChangePct + '%' : '—',
      PCRV: dash(latest.PCRV),
      TVA: pct(latest.TVA),
      timestamp: latest.timestamp,
    });
  }
  res.json({ rows, lastUpdated });
});

function parseNumber(val) {
  if (val == null) return null;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
}

function percentNoDecimals(val) {
  if (val == null || String(val).trim() === '') return '—';
  const n = parseFloat(String(val).replace(/%/g, '').replace(/,/g, ''));
  if (Number.isNaN(n)) return '—';
  return Math.round(n) + '%';
}

async function runScheduledScrape() {
  const now = new Date().toISOString();
  console.log('[cron] Running scheduled scrape at', now);
  for (const ticker of SCHEDULED_TICKERS) {
    try {
      const data = await scrapeOptions(ticker);
      const record = { ...data, timestamp: now, source: 'scheduled' };
      appendSnapshot(record);
      console.log('[cron] Saved', ticker, data.IVR);
    } catch (e) {
      console.error('[cron] Failed', ticker, e.message);
    }
  }
}

// Run at 20:50 Taiwan (12:50 UTC) on weekdays
cron.schedule(CRON_20_50_TAIWAN, runScheduledScrape, {
  timezone: 'UTC',
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`DATA_DIR=${DATA_DIR} (use a Volume mounted here so watchlists/snapshots persist across devices and redeploys)`);
  console.log(`Scheduled scrape: 20:50 Taiwan (12:50 UTC) Mon–Fri for [${SCHEDULED_TICKERS.join(', ')}]`);
});
