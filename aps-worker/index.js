// Cloudflare Worker — APS OAuth proxy
const CLIENT_ID     = 'kOJ4igA0Lm8a9ZHA3KGkATKASthAdjiWBjY9ventTQBnGVab';
const CLIENT_SECRET = 'GFwhQIEpFLUGFEfS5Iug0m8Q869JAhO9Dfk83L11BCPmuuVdwkv6GDOuBXvjBO2E';
const APS_TOKEN_URL = 'https://developer.api.autodesk.com/authentication/v2/token';

const ALLOWED_ORIGINS = [
  'https://voxelbim.pages.dev',
  'http://localhost:3000',
];

function getCORS(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Callback URL según origen
const CALLBACK_URLS = {
  'https://voxelbim.pages.dev': 'https://voxelbim.pages.dev/app/autodesk.html',
  'http://localhost:3000':      'http://localhost:3000/app/autodesk.html',
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors   = getCORS(origin);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);

    // ---- PROXY CLAUDE AI ----
    if (request.method === 'POST' && url.pathname === '/claude') {
      try {
        const payload = await request.json();
        const apiKey  = env.ANTHROPIC_API_KEY || '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';
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key':         apiKey,
          },
          body: JSON.stringify(payload),
        });
        return json(await resp.json(), resp.status, cors);
      } catch(e) { return json({ error: e.message }, 500, cors); }
    }

    // ---- PROXY APS TOKEN ----
    if (request.method === 'POST' && url.pathname === '/token') {
      try {
        const body        = await request.json();
        if (!body.code)   return json({ error: 'missing code' }, 400, cors);
        const callbackUrl = CALLBACK_URLS[origin] || CALLBACK_URLS['https://voxelbim.pages.dev'];
        const params = new URLSearchParams({
          grant_type:    'authorization_code',
          code:           body.code,
          redirect_uri:   callbackUrl,
          client_id:      CLIENT_ID,
          client_secret:  CLIENT_SECRET,
          scope:          'data:read viewables:read account:read bucket:read',
        });
        const resp = await fetch(APS_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        return json(await resp.json(), resp.status, cors);
      } catch(e) { return json({ error: e.message }, 500, cors); }
    }
    return json({ error: 'not found' }, 404, cors);
  }
};

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  });
}
