import { getPcrHistory } from '../../../lib/optioncharts.js';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  });
}

export async function onRequestGet({ params, request }) {
  try {
    const url = new URL(request.url);
    const data = await getPcrHistory(params.ticker, url.searchParams.get('days'));
    return json(data);
  } catch (error) {
    return json(
      {
        error: 'OptionCharts PCR failed',
        message: error.message,
        details: error.details,
      },
      { status: error.statusCode || 502 },
    );
  }
}
