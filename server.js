/**
 * OptionCharts scraper API
 * - Manual: GET /api/options/:ticker
 * - Scheduled: 20:50 Taiwan time (12:50 UTC) on Mon–Fri, scrapes configured tickers and stores
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { scrapeOptions } from './lib/scraper.js';
import { appendSnapshot, getSnapshots } from './lib/store.js';

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
app.use(express.static(join(__dirname, 'public')));

// Health for Railway

app.get('/health', (req, res) => res.send('ok'));

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
 * Table data: latest timed-scrape snapshot per symbol, with TOI/TV change % from previous timed scrape.
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
    const snapshots = getSnapshots(symbol, 50).filter((s) => s.source === 'scheduled');
    const latest = snapshots[0];
    const prev = snapshots[1];
    if (!latest) continue;
    const toiNum = parseNumber(latest.TOI);
    const tvNum = parseNumber(latest.TV);
    const prevToi = prev ? parseNumber(prev.TOI) : null;
    const prevTv = prev ? parseNumber(prev.TV) : null;
    let toiChangePct = null;
    let tvChangePct = null;
    if (prevToi != null && prevToi !== 0) toiChangePct = (((toiNum - prevToi) / prevToi) * 100).toFixed(2);
    if (prevTv != null && prevTv !== 0) tvChangePct = (((tvNum - prevTv) / prevTv) * 100).toFixed(2);
    if (latest.timestamp && (!lastUpdated || latest.timestamp > lastUpdated)) lastUpdated = latest.timestamp;
    rows.push({
      symbol: latest.ticker || symbol,
      IVR: latest.IVR,
      TOI: latest.TOI,
      toiChangePct: toiChangePct != null ? (parseFloat(toiChangePct) >= 0 ? '+' : '') + toiChangePct + '%' : '—',
      PCRO: latest.PCRO,
      TOA: latest.TOA,
      TV: latest.TV,
      tvChangePct: tvChangePct != null ? (parseFloat(tvChangePct) >= 0 ? '+' : '') + tvChangePct + '%' : '—',
      PCRV: latest.PCRV,
      TVA: latest.TVA,
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
  console.log(`Scheduled scrape: 20:50 Taiwan (12:50 UTC) Mon–Fri for [${SCHEDULED_TICKERS.join(', ')}]`);
});
