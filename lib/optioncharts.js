const OPTIONCHARTS_BASE_URL = 'https://optioncharts.io/';

function toSymbol(ticker) {
  return String(ticker || '').trim().toUpperCase();
}

function parsePositiveInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, min), max);
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildOptionChartsUrl(symbol) {
  const url = new URL('/async/option_history_open_interest', OPTIONCHARTS_BASE_URL);
  url.searchParams.set('ticker', symbol);
  url.searchParams.set('period', '1y');
  url.searchParams.set('indicators', 'open_interest_put_call_ratio,open_interest_put_call_totals,underlying_price');
  return url;
}

async function optionChartsGet(symbol) {
  const response = await fetch(buildOptionChartsUrl(symbol), {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'PCR Tracker (OptionCharts datasource)',
    },
  });

  if (!response.ok) {
    const error = new Error(`OptionCharts request failed (${response.status})`);
    error.statusCode = response.status;
    error.details = (await response.text()).slice(0, 500);
    throw error;
  }

  return response.text();
}

function extractChartData(html) {
  const match = html.match(/(?:const|let|var)\s+chart_data\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    const error = new Error('OptionCharts response did not include chart data');
    error.statusCode = 502;
    throw error;
  }

  try {
    return JSON.parse(match[1]);
  } catch (cause) {
    const error = new Error('Unable to parse OptionCharts chart data');
    error.statusCode = 502;
    error.cause = cause;
    throw error;
  }
}

function pointFromItem(item) {
  const date = String(item.timestamp || '').split('T')[0];
  const PCRO = parseNumber(item.open_interest_put_call_ratio);
  const putOpenInterest = parseNumber(item.open_interest_puts);
  const callOpenInterest = parseNumber(item.open_interest_calls);

  return {
    date,
    PCRV: null,
    PCRO,
    putVolume: null,
    callVolume: null,
    putOpenInterest,
    callOpenInterest,
    closePrice: parseNumber(item.close_price),
  };
}

export async function getPcrHistory(ticker, days = 20) {
  const symbol = toSymbol(ticker);
  if (!symbol) {
    const error = new Error('Missing ticker');
    error.statusCode = 400;
    throw error;
  }

  const count = parsePositiveInteger(days, 20, 1, 60);
  const html = await optionChartsGet(symbol);
  const chartData = extractChartData(html);
  const allPoints = chartData
    .map(pointFromItem)
    .filter((point) => point.date && point.PCRO != null);
  const points = allPoints.slice(-count);

  if (points.length === 0) {
    const error = new Error('No OptionCharts PCR history found');
    error.statusCode = 404;
    throw error;
  }

  return {
    ticker: symbol,
    days: count,
    source: 'optioncharts.io',
    ratioField: 'PCRO',
    points,
    coverage: {
      requested: count,
      returned: points.length,
      available: allPoints.length,
    },
  };
}
