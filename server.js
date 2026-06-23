import { config } from 'dotenv';

config({ path: ['.env.local', '.env'] });

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadWatchlists, saveWatchlists, DATA_DIR } from './lib/store.js';
import { getPcrHistory } from './lib/optioncharts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const WATCHLISTS_REMOTE_URL = process.env.WATCHLISTS_REMOTE_URL || 'https://pcr-oc-2026jun.pages.dev/api/watchlists';

app.use(express.json());

// CORS: allow frontend on Cloudflare Pages (PCR OC 2026Jun and preview subdomains)
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (origin === 'https://pcr-oc-2026jun.pages.dev' || /^https:\/\/[a-z0-9-]+\.pcr-oc-2026jun\.pages\.dev$/.test(origin)) {
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

async function fetchRemoteWatchlists() {
  const response = await fetch(WATCHLISTS_REMOTE_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Remote watchlists failed (${response.status})`);
  const data = await response.json();
  saveWatchlists(data);
  return data;
}

async function saveRemoteWatchlists(watchlists, { merge = false } = {}) {
  const url = merge ? `${WATCHLISTS_REMOTE_URL}?merge=1` : WATCHLISTS_REMOTE_URL;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(watchlists),
  });
  if (!response.ok) throw new Error(`Remote watchlist save failed (${response.status})`);
  const data = await response.json();
  saveWatchlists(data);
  return data;
}

/**
 * Get saved watchlists (sync across devices). Shape: { "1": [...], "2": [...], ... "6": [] }
 */
app.get('/api/watchlists', async (req, res) => {
  try {
    const data = await fetchRemoteWatchlists();
    res.json(data);
  } catch (e) {
    console.error('Remote watchlists unavailable, using local cache:', e.message);
    res.json(loadWatchlists());
  }
});

/**
 * OptionCharts-powered PCR history.
 * GET /api/pcr/:ticker?days=20
 */
app.get('/api/pcr/:ticker', async (req, res) => {
  try {
    const data = await getPcrHistory(req.params.ticker, req.query.days, {
      scope: req.query.scope,
      dte: req.query.dte,
    });
    res.json(data);
  } catch (e) {
    console.error('OptionCharts PCR failed:', e.message);
    res.status(e.statusCode || 502).json({
      error: 'OptionCharts PCR failed',
      message: e.message,
      details: e.details,
    });
  }
});

/**
 * Save watchlists (sync across devices). Body: { "1": [...], "2": [...], ... "6": [] }
 */
app.post('/api/watchlists', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    const data = await saveRemoteWatchlists(body, { merge: req.query.merge === '1' });
    res.json(data);
  } catch (e) {
    console.error('Remote watchlist save unavailable, saving local cache:', e.message);
    saveWatchlists(body);
    res.json(loadWatchlists());
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`DATA_DIR=${DATA_DIR} (use a Volume mounted here so watchlists persist across devices and redeploys)`);
  console.log(`Watchlist sync: ${WATCHLISTS_REMOTE_URL}`);
  console.log('PCR data source: optioncharts.io');
});
