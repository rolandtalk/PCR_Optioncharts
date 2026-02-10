#!/usr/bin/env node
/**
 * One-off: run a manual scrape and save to the same store the server uses.
 * Usage: node trigger-first-scrape.js [TICKER]
 * Default ticker: AVAV
 *
 * If Playwright browsers are missing, run first:
 *   npx playwright install chromium
 */

import { scrapeOptions } from './lib/scraper.js';
import { appendSnapshot } from './lib/store.js';

const ticker = (process.argv[2] || 'AVAV').toUpperCase();

console.log('Scraping', ticker, '...');
scrapeOptions(ticker)
  .then((data) => {
    const record = {
      ...data,
      ticker,
      timestamp: new Date().toISOString(),
      source: 'manual',
    };
    appendSnapshot(record);
    console.log('Saved snapshot:', record.timestamp);
    console.log('IVR:', record.IVR, '| TOI:', record.TOI, '| TV:', record.TV);
  })
  .catch((e) => {
    console.error('Scrape failed:', e.message);
    process.exit(1);
  });
