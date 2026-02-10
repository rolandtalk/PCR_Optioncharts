#!/usr/bin/env node
/**
 * CLI: scrape option metrics (order IVR, TOI, PCRO, TOA, TV, PCRV, TVA)
 * Usage: node scrape-avav.js [TICKER]
 */

import { scrapeOptions } from './lib/scraper.js';

const ticker = process.argv[2] || 'AVAV';
scrapeOptions(ticker)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    console.log('\n--- Legend ---');
    console.log('IVR  = IV Rank | TOI = Today\'s Open Interest | PCRO = Put-Call Ratio (OI)');
    console.log('TOA  = Today vs OI Avg (30d) | TV = Today\'s Volume | PCRV = Put-Call Ratio (Vol) | TVA = Today vs Vol Avg (30d)');
  })
  .catch((e) => {
    console.error('Scrape failed:', e.message);
    process.exit(1);
  });
