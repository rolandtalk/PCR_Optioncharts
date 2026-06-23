const EMPTY_WATCHLISTS = {
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
};

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
  if (!env.WATCHLISTS) return json(EMPTY_WATCHLISTS);

  const stored = await env.WATCHLISTS.get('watchlists', 'json');
  return json(stored || EMPTY_WATCHLISTS);
}

export async function onRequestPost({ env, request }) {
  const body = await request.json().catch(() => EMPTY_WATCHLISTS);

  if (env.WATCHLISTS) {
    await env.WATCHLISTS.put('watchlists', JSON.stringify(body));
  }

  return json(body);
}
