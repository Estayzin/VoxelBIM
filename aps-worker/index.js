// Cloudflare Worker — APS OAuth proxy
const CLIENT_ID     = 'kOJ4igA0Lm8a9ZHA3KGkATKASthAdjiWBjY9ventTQBnGVab';
const CLIENT_SECRET = 'GFwhQIEpFLUGFEfS5Iug0m8Q869JAhO9Dfk83L11BCPmuuVdwkv6GDOuBXvjBO2E';
const CALLBACK_URL  = 'https://revisor-ifc-pages.pages.dev/autodesk.html';
const APS_TOKEN_URL = 'https://developer.api.autodesk.com/authentication/v2/token';

const CORS = {
  'Access-Control-Allow-Origin': 'https://revisor-ifc-pages.pages.dev',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/token') {
      try {
        const body = await request.json();
        if (!body.code) return json({ error: 'missing code' }, 400);
        const params = new URLSearchParams({
          grant_type:   'authorization_code',
          code:          body.code,
          redirect_uri:  CALLBACK_URL,
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
        });
        const resp = await fetch(APS_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        return json(await resp.json(), resp.status);
      } catch(e) { return json({ error: e.message }, 500); }
    }
    return json({ error: 'not found' }, 404);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
