import { cloneDefaultWatchlists } from '../../lib/defaultWatchlists.js';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  });
}

export async function onRequestGet({ env }) {
  if (!env.WATCHLISTS) return json(cloneDefaultWatchlists());

  const stored = await env.WATCHLISTS.get('watchlists', 'json');
  return json(stored || cloneDefaultWatchlists());
}

export async function onRequestPost({ env, request }) {
  const body = await request.json().catch(() => cloneDefaultWatchlists());
  const shouldMerge = new URL(request.url).searchParams.get('merge') === '1';
  let output = body;

  if (shouldMerge && env.WATCHLISTS) {
    const stored = (await env.WATCHLISTS.get('watchlists', 'json')) || cloneDefaultWatchlists();
    output = mergeWatchlists(stored, body);
  }

  if (env.WATCHLISTS) {
    await env.WATCHLISTS.put('watchlists', JSON.stringify(output));
  }

  return json(output);
}

function mergeWatchlists(base, incoming) {
  const out = {};

  for (let i = 1; i <= 6; i++) {
    const key = String(i);
    const symbols = [
      ...(Array.isArray(base[key]) ? base[key] : []),
      ...(Array.isArray(incoming[key]) ? incoming[key] : []),
    ];

    out[key] = [...new Set(symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  }

  return out;
}
