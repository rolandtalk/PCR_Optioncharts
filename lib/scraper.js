/**
 * Scrape option metrics from optioncharts.io
 * Order: IVR, TOI, PCRO, TOA, TV, PCRV, TVA
 */

import { chromium } from 'playwright';

const BASE_URL = 'https://optioncharts.io/options';

export async function scrapeOptions(ticker) {
  const url = `${BASE_URL}/${encodeURIComponent(ticker)}`;
  const browser = await chromium.launch({
    headless: true,
    args: process.env.RAILWAY ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    const data = await page.evaluate(() => {
      const out = {};
      if (typeof iv_rank !== 'undefined') out.iv_rank = iv_rank;
      const iv30 = typeof implied_volatility_30d !== 'undefined' ? implied_volatility_30d
        : (typeof iv_30d !== 'undefined' ? iv_30d : (typeof implied_volatility !== 'undefined' ? implied_volatility : (typeof iv !== 'undefined' ? iv : undefined)));
      if (iv30 != null) out.implied_volatility_30d = iv30;
      if (typeof volume_put_call_ratio !== 'undefined') out.volume_put_call_ratio = volume_put_call_ratio;
      if (typeof open_interest_put_call_ratio !== 'undefined') out.open_interest_put_call_ratio = open_interest_put_call_ratio;
      if (typeof volume_total !== 'undefined') out.volume_total = volume_total;
      if (typeof volume_avg !== 'undefined') out.volume_avg = volume_avg;
      if (typeof open_interest_total !== 'undefined') out.open_interest_total = open_interest_total;
      if (typeof open_interest_avg !== 'undefined') out.open_interest_avg = open_interest_avg;
      return out;
    });

    await browser.close();

    const TOA = data.open_interest_total != null && data.open_interest_avg != null
      ? ((data.open_interest_total / data.open_interest_avg) * 100).toFixed(2) + '%'
      : null;
    const TVA = data.volume_total != null && data.volume_avg != null
      ? ((data.volume_total / data.volume_avg) * 100).toFixed(2) + '%'
      : null;

    const IV = data.implied_volatility_30d != null
      ? (Math.round(parseFloat(String(data.implied_volatility_30d).replace(/%/g, '')) || 0) + '%')
      : null;
    // Order: IV, IVR, TOI, PCRO, TOA, TV, PCRV, TVA
    return {
      ticker: String(ticker).toUpperCase(),
      IV,
      IVR: data.iv_rank != null ? (typeof data.iv_rank === 'number' ? data.iv_rank.toFixed(2) + '%' : String(data.iv_rank)) : null,
      TOI: data.open_interest_total != null ? data.open_interest_total.toLocaleString() : null,
      PCRO: data.open_interest_put_call_ratio != null ? String(data.open_interest_put_call_ratio) : null,
      TOA,
      TV: data.volume_total != null ? data.volume_total.toLocaleString() : null,
      PCRV: data.volume_put_call_ratio != null ? String(data.volume_put_call_ratio) : null,
      TVA,
    };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

const MAX_CONCURRENT_PAGES = 5;

function processScrapeData(data, ticker) {
  const TOA = data.open_interest_total != null && data.open_interest_avg != null
    ? ((data.open_interest_total / data.open_interest_avg) * 100).toFixed(2) + '%'
    : null;
  const TVA = data.volume_total != null && data.volume_avg != null
    ? ((data.volume_total / data.volume_avg) * 100).toFixed(2) + '%'
    : null;
  const IV = data.implied_volatility_30d != null
    ? (Math.round(parseFloat(String(data.implied_volatility_30d).replace(/%/g, '')) || 0) + '%')
    : null;
  return {
    ticker: String(ticker).toUpperCase(),
    IV,
    IVR: data.iv_rank != null ? (typeof data.iv_rank === 'number' ? data.iv_rank.toFixed(2) + '%' : String(data.iv_rank)) : null,
    TOI: data.open_interest_total != null ? data.open_interest_total.toLocaleString() : null,
    PCRO: data.open_interest_put_call_ratio != null ? String(data.open_interest_put_call_ratio) : null,
    TOA,
    TV: data.volume_total != null ? data.volume_total.toLocaleString() : null,
    PCRV: data.volume_put_call_ratio != null ? String(data.volume_put_call_ratio) : null,
    TVA,
  };
}

/**
 * Scrape multiple tickers in parallel using one browser and multiple pages.
 * Runs up to MAX_CONCURRENT_PAGES at a time. Returns array of { ticker, data } or { ticker, error }.
 */
export async function scrapeMultiple(tickers) {
  const list = Array.isArray(tickers) ? tickers.map((t) => String(t).toUpperCase()).filter(Boolean) : [];
  if (list.length === 0) return [];

  const browser = await chromium.launch({
    headless: true,
    args: process.env.RAILWAY ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  });

  const scrapeOne = async (ticker) => {
    const url = `${BASE_URL}/${encodeURIComponent(ticker)}`;
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2500);
      const data = await page.evaluate(() => {
        const out = {};
        if (typeof iv_rank !== 'undefined') out.iv_rank = iv_rank;
        const iv30 = typeof implied_volatility_30d !== 'undefined' ? implied_volatility_30d
          : (typeof iv_30d !== 'undefined' ? iv_30d : (typeof implied_volatility !== 'undefined' ? implied_volatility : (typeof iv !== 'undefined' ? iv : undefined)));
        if (iv30 != null) out.implied_volatility_30d = iv30;
        if (typeof volume_put_call_ratio !== 'undefined') out.volume_put_call_ratio = volume_put_call_ratio;
        if (typeof open_interest_put_call_ratio !== 'undefined') out.open_interest_put_call_ratio = open_interest_put_call_ratio;
        if (typeof volume_total !== 'undefined') out.volume_total = volume_total;
        if (typeof volume_avg !== 'undefined') out.volume_avg = volume_avg;
        if (typeof open_interest_total !== 'undefined') out.open_interest_total = open_interest_total;
        if (typeof open_interest_avg !== 'undefined') out.open_interest_avg = open_interest_avg;
        return out;
      });
      await page.close();
      return { ticker, data: processScrapeData(data, ticker) };
    } catch (err) {
      await page.close();
      return { ticker, error: err.message };
    }
  };

  const results = [];
  for (let i = 0; i < list.length; i += MAX_CONCURRENT_PAGES) {
    const chunk = list.slice(i, i + MAX_CONCURRENT_PAGES);
    const chunkResults = await Promise.all(chunk.map(scrapeOne));
    results.push(...chunkResults);
  }

  await browser.close();
  return results;
}
