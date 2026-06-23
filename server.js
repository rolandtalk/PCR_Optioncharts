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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`DATA_DIR=${DATA_DIR} (use a Volume mounted here so watchlists persist across devices and redeploys)`);
  console.log('PCR data source: optioncharts.io');
});
