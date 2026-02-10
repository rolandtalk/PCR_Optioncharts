/**
 * OptionCharts scraper API
 * - Manual: GET /api/options/:ticker
 * - Scheduled: 20:50 Taiwan time (12:50 UTC) on Mon–Fri, scrapes configured tickers and stores
 */

import express from 'express';
import cron from 'node-cron';
import { scrapeOptions } from './lib/scraper.js';
import { appendSnapshot, getSnapshots } from './lib/store.js';

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

// Health for Railway
app.get('/', (req, res) => {
  res.json({
    name: 'optioncharts-scraper-api',
    docs: {
      manual: 'GET /api/options/:ticker — scrape now, return IVR/TOI/PCRO/TOA/TV/PCRV/TVA',
      history: 'GET /api/options/:ticker/snapshots?limit=50 — stored snapshots',
      cron: 'Runs at 20:50 Taiwan time (12:50 UTC) on Mon–Fri for SCHEDULED_TICKERS',
    },
  });
});

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
