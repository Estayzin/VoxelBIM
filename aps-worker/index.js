// Cloudflare Worker — APS OAuth proxy + Upload helper
const CLIENT_ID     = 'kOJ4igA0Lm8a9ZHA3KGkATKASthAdjiWBjY9ventTQBnGVab';
const CLIENT_SECRET = 'GFwhQIEpFLUGFEfS5Iug0m8Q869JAhO9Dfk83L11BCPmuuVdwkv6GDOuBXvjBO2E';
const APS_TOKEN_URL = 'https://developer.api.autodesk.com/authentication/v2/token';
const BUCKET_KEY    = 'voxelbim-uploads-v1';

const ALLOWED_ORIGINS = [
  'https://voxelbim.pages.dev',
  'https://develop.voxelbim.pages.dev',
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
  'https://voxelbim.pages.dev':         'https://voxelbim.pages.dev/app/autodesk.html',
  'https://develop.voxelbim.pages.dev': 'https://develop.voxelbim.pages.dev/app/autodesk.html',
  'http://localhost:3000':              'http://localhost:3000/app/autodesk.html',
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
        const callbackUrl = body.redirect_uri || CALLBACK_URLS[origin] || CALLBACK_URLS['https://voxelbim.pages.dev'];
        const params = new URLSearchParams({
          grant_type:    'authorization_code',
          code:           body.code,
          redirect_uri:   callbackUrl,
          client_id:      CLIENT_ID,
          client_secret:  CLIENT_SECRET,
        });
        const resp = await fetch(APS_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        return json(await resp.json(), resp.status, cors);
      } catch(e) { return json({ error: e.message }, 500, cors); }
    }
    // ---- TOKEN 2-LEGGED para el viewer ----
    if (request.method === 'GET' && url.pathname === '/aps/token2l') {
      try {
        const token = await get2LToken('data:read viewables:read');
        return json({ access_token: token, expires_in: 3600 }, 200, cors);
      } catch(e) { return json({ error: e.message }, 500, cors); }
    }

    // ---- UPLOAD INIT ----
    if (request.method === 'POST' && url.pathname === '/aps/upload-init') {
      try {
        const { filename } = await request.json();
        const objectKey = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const token = await get2LToken();
        await ensureBucket(token);
        const r = await fetch(
          `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET_KEY}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await r.json();
        if (!data.urls) return json({ error: data.reason || 'No signed URL' }, 400, cors);
        const urnRaw = `urn:adsk.objects:os.object:${BUCKET_KEY}/${objectKey}`;
        const urn    = btoa(urnRaw).replace(/=/g, '');
        return json({ uploadKey: data.uploadKey, signedUrl: data.urls[0], urn, objectKey }, 200, cors);
      } catch(e) { return json({ error: e.message }, 500, cors); }
    }

    // ---- UPLOAD COMPLETE ----
    if (request.method === 'POST' && url.pathname === '/aps/upload-complete') {
      try {
        const { objectKey, uploadKey } = await request.json();
        const token = await get2LToken();
        const r = await fetch(
          `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET_KEY}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadKey })
          }
        );
        return json(await r.json(), r.status, cors);
      } catch(e) { return json({ error: e.message }, 500, cors); }
    }

    // ---- TRANSLATE ----
    if (request.method === 'POST' && url.pathname === '/aps/translate') {
      try {
        const { urn } = await request.json();
        const token = await get2LToken();
        const r = await fetch('https://developer.api.autodesk.com/modelderivative/v2/designdata/job', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-ads-force': 'true' },
          body: JSON.stringify({
            input:  { urn },
            output: { formats: [{ type: 'svf2', views: ['2d', '3d'] }] }
          })
        });
        return json(await r.json(), r.status, cors);
      } catch(e) { return json({ error: e.message }, 500, cors); }
    }

    // ---- TRANSLATION STATUS ----
    if (request.method === 'GET' && url.pathname === '/aps/status') {
      try {
        const urn   = url.searchParams.get('urn');
        const token = await get2LToken();
        const r = await fetch(
          `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return json(await r.json(), r.status, cors);
      } catch(e) { return json({ error: e.message }, 500, cors); }
    }

    return json({ error: 'not found' }, 404, cors);
  }
};

async function get2LToken(scope = 'data:read data:write data:create bucket:create bucket:read') {
  const r = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      scope,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    })
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('2L token failed: ' + JSON.stringify(d));
  return d.access_token;
}

async function ensureBucket(token) {
  const r = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET_KEY}/details`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (r.status === 200) return;
  await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketKey: BUCKET_KEY, policyKey: 'transient' })
  });
}

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  });
}
