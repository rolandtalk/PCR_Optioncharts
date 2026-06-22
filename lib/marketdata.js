const MARKETDATA_BASE_URL = 'https://api.marketdata.app/v1/';

function getToken() {
  return process.env.MARKETDATA_API_TOKEN || process.env.MARKETDATA_TOKEN || '';
}

function assertToken() {
  const token = getToken();
  if (!token) {
    const error = new Error('Missing MARKETDATA_API_TOKEN');
    error.statusCode = 500;
    throw error;
  }
  return token;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
}

function recentWeekdays(days, lookbackMultiplier = 6) {
  const dates = [];
  let cursor = subtractDays(new Date(), 1);
  const maxCandidates = Math.max(days * lookbackMultiplier, days + 5);
  while (dates.length < maxCandidates) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(toIsoDate(cursor));
    cursor = subtractDays(cursor, 1);
  }
  return dates;
}

function epochToIsoDate(epochSeconds) {
  return new Date(Number(epochSeconds) * 1000).toISOString().slice(0, 10);
}

async function marketdataGet(path, params = {}) {
  const token = assertToken();
  const url = new URL(String(path).replace(/^\/+/, ''), MARKETDATA_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (![200, 203].includes(response.status)) {
    const body = await response.text();
    const error = new Error(`Marketdata request failed (${response.status})`);
    error.statusCode = response.status;
    error.details = body.slice(0, 500);
    throw error;
  }

  const data = await response.json();
  if (data.s && data.s !== 'ok') {
    const error = new Error(data.errmsg || `Marketdata returned ${data.s}`);
    error.statusCode = data.s === 'no_data' ? 404 : 502;
    throw error;
  }
  return data;
}

function sumBySide(chain, field, side) {
  const sides = Array.isArray(chain.side) ? chain.side : [];
  const values = Array.isArray(chain[field]) ? chain[field] : [];
  return sides.reduce((total, currentSide, index) => {
    if (String(currentSide).toLowerCase() !== side) return total;
    const value = Number(values[index]);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

function ratio(puts, calls) {
  if (!Number.isFinite(puts) || !Number.isFinite(calls) || calls <= 0) return null;
  return Number((puts / calls).toFixed(4));
}

function pointFromChain(date, chain) {
  const putVolume = sumBySide(chain, 'volume', 'put');
  const callVolume = sumBySide(chain, 'volume', 'call');
  const putOpenInterest = sumBySide(chain, 'openInterest', 'put');
  const callOpenInterest = sumBySide(chain, 'openInterest', 'call');
  return {
    date,
    PCRV: ratio(putVolume, callVolume),
    PCRO: ratio(putOpenInterest, callOpenInterest),
    putVolume,
    callVolume,
    putOpenInterest,
    callOpenInterest,
  };
}

async function getTradingDates(symbol, count) {
  const today = toIsoDate(new Date());
  try {
    const candles = await marketdataGet(`/stocks/candles/D/${encodeURIComponent(symbol)}/`, {
      countback: Math.max(count * 4, count + 20),
    });
    const timestamps = Array.isArray(candles.t) ? candles.t : [];
    const dates = timestamps
      .map(epochToIsoDate)
      .filter(Boolean)
      .filter((date) => date < today)
      .reverse();
    return dates.length ? dates : recentWeekdays(count);
  } catch (error) {
    if ([401, 403].includes(error.statusCode)) throw error;
    return recentWeekdays(count);
  }
}

function buildChainParams(date, options) {
  if (options.scope === 'all') {
    return { date, expiration: 'all' };
  }
  return {
    date,
    dte: options.dte,
  };
}

function isSkippableMarketdataError(error) {
  return [400, 403, 404, 422, 429, 500, 502, 503].includes(error.statusCode);
}

export async function getPcrHistory(ticker, days = 20, options = {}) {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol) {
    const error = new Error('Missing ticker');
    error.statusCode = 400;
    throw error;
  }

  const count = Math.min(Math.max(Number.parseInt(days, 10) || 20, 1), 60);
  const scope = options.scope === 'all' ? 'all' : 'near';
  const dte = Math.min(Math.max(Number.parseInt(options.dte, 10) || 30, 1), 730);
  const dates = await getTradingDates(symbol, count);
  const points = [];
  const errors = [];

  for (const date of dates) {
    try {
      const chain = await marketdataGet(
        `/options/chain/${encodeURIComponent(symbol)}/`,
        buildChainParams(date, { scope, dte }),
      );
      const point = pointFromChain(date, chain);
      if (point.PCRV != null || point.PCRO != null) points.push(point);
      if (points.length >= count) break;
    } catch (error) {
      if (!isSkippableMarketdataError(error)) throw error;
      errors.push({ date, statusCode: error.statusCode, message: error.message });
    }
  }

  if (points.length === 0) {
    const error = new Error('No Marketdata PCR history found');
    error.statusCode = 404;
    throw error;
  }

  return {
    ticker: symbol,
    days: count,
    source: 'marketdata.app',
    scope,
    dte: scope === 'near' ? dte : null,
    ratioField: 'PCRO',
    points: points.reverse(),
    coverage: {
      requested: count,
      returned: points.length,
      attempted: dates.length,
      missing: errors.length,
    },
  };
}
