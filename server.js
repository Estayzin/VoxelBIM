const http = require('http');
const https = require('https');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const querystring = require('querystring');

// ═══════════════════════════════════════════════════════════════
// CARGAR .env
// ═══════════════════════════════════════════════════════════════

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

// Cargar variables de entorno
let APS_CLIENT_ID = process.env.APS_CLIENT_ID;
let APS_CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
let APS_CALLBACK_URL = process.env.APS_CALLBACK_URL || 'http://localhost:3000/app/autodesk.html';
let CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const ROOT = path.resolve(__dirname);

const MIME = {
  html: 'text/html; charset=utf-8',
  js:   'application/javascript',
  css:  'text/css',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  svg:  'image/svg+xml',
  json: 'application/json',
  ico:  'image/x-icon',
  wasm: 'application/wasm',
  mjs:  'application/javascript',
  txt:  'text/plain',
};

// ═══════════════════════════════════════════════════════════
// UTILIDADES HTTP
// ═══════════════════════════════════════════════════════════

function httpsRequest(method, urlString, bodyData = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new url.URL(urlString);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (bodyData) {
      const body = typeof bodyData === 'string' ? bodyData : querystring.stringify(bodyData);
      req.write(body);
    }
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════

// Endpoint: /aps/token
async function handleApsToken(req, res, body) {
  try {
    const { code } = JSON.parse(body);

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing_code' }));
      return;
    }

    console.log('[APS Token Request]');
    console.log('  Code:', code.substring(0, 20) + '...');
    console.log('  Client ID:', APS_CLIENT_ID ? 'PRESENTE' : 'FALTA');
    console.log('  Client Secret:', APS_CLIENT_SECRET ? 'PRESENTE' : 'FALTA');
    console.log('  Redirect URI:', APS_CALLBACK_URL);

    // Si no hay credenciales, modo demo
    if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
      console.log('[APS] ⚠️  No hay credenciales, modo DEMO');
      if (isDev) {
        const tokenDemo = {
          access_token: 'demo_token_' + Date.now(),
          token_type: 'Bearer',
          expires_in: 3600,
          _isDemoToken: true,
          _message: 'Demo token — Configure APS_CLIENT_ID y APS_CLIENT_SECRET',
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tokenDemo));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_credentials' }));
      }
      return;
    }

    // Intercambio real con Autodesk
    const tokenUrl = 'https://developer.api.autodesk.com/authentication/v2/token';
    const tokenBody = {
      grant_type: 'authorization_code',
      code: code,
      client_id: APS_CLIENT_ID,
      client_secret: APS_CLIENT_SECRET,
      redirect_uri: APS_CALLBACK_URL,
    };

    console.log('[APS] Intercambiando código con Autodesk...');
    const response = await httpsRequest('POST', tokenUrl, tokenBody);

    if (response.status === 200 && response.data.access_token) {
      console.log('[APS] ✅ Token obtenido exitosamente');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.data));
    } else {
      console.error('[APS] ❌ Error:', response.status, JSON.stringify(response.data));
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: response.data.error || 'invalid_grant',
        error_description: response.data.error_description || 'No se pudo canjear el código',
      }));
    }
  } catch (err) {
    console.error('[APS Token Error]', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// Endpoint: /claude/chat
async function handleClaudeChat(req, res, body) {
  try {
    const data = JSON.parse(body);

    if (!CLAUDE_API_KEY) {
      if (isDev) {
        const demoResponse = {
          content: [{ type: 'text', text: 'Demo response de Claude' }],
          model: 'claude-3-5-sonnet-20241022',
          _isDemoResponse: true,
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(demoResponse));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Claude API key not configured' }));
      }
      return;
    }

    // Solicitud a Claude API
    const claudeUrl = 'https://api.anthropic.com/v1/messages';
    const claudeBody = JSON.stringify({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 1024,
      messages: data.messages || [{ role: 'user', content: 'Hola' }],
    });

    console.log('[Claude API Request]');
    console.log('  URL:', claudeUrl);
    console.log('  API Key:', CLAUDE_API_KEY ? `${CLAUDE_API_KEY.substring(0, 20)}...` : 'FALTA');
    console.log('  Body:', claudeBody.substring(0, 100) + '...');

    const response = await httpsRequest('POST', claudeUrl, claudeBody, {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    });

    console.log('[Claude API Response]');
    console.log('  Status:', response.status);
    console.log('  Data:', JSON.stringify(response.data).substring(0, 200));

    if (response.status === 200) {
      console.log('[Claude] ✅ Respuesta exitosa');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.data));
    } else {
      console.error('[Claude] ❌ Error:', response.status, response.data);
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Claude API error', details: response.data }));
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ═══════════════════════════════════════════════════════════
// SERVIDOR HTTP
// ═══════════════════════════════════════════════════════════

http.createServer((req, res) => {
  // Headers CORS para todos los endpoints
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Manejo de OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // ─ Rutas API ─
  if (pathname === '/aps/token' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handleApsToken(req, res, body));
    return;
  }

  if (pathname === '/claude/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handleClaudeChat(req, res, body));
    return;
  }

  // ─ Archivos estáticos ─
  const file = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(ROOT, file);

  // Seguridad
  if (!full.startsWith(path.resolve(ROOT))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + file);
      return;
    }

    const ext = full.split('.').pop().toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    // Headers COOP/COEP para Autodesk Viewer y WASM
    // voxelbim.html: COEP unsafe-none para que crossOriginIsolated=false
    // y web-ifc use WASM single-thread (evita pthread workers con URL inválida)
    const isVoxelBimPage = pathname.endsWith('voxelbim.html');
    const headers = {
      'Content-Type': contentType,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': isVoxelBimPage ? 'unsafe-none' : 'credentialless',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    };

    res.writeHead(200, headers);
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║        VoxelBIM Server v1.1 (2026)            ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log('║  🚀 http://localhost:' + PORT + '                         ║');
  console.log('║  📍 /index.html — Portal principal             ║');
  console.log('║  🔷 /app/autodesk.html — APS + Claude          ║');
  console.log('║  🎬 /app/voxelbim.html — Visor IFC             ║');
  console.log('║  📡 /aps/token — API Autodesk OAuth            ║');
  console.log('║  🤖 /claude/chat — API Claude                  ║');
  console.log('╠════════════════════════════════════════════════╣');
  if (APS_CLIENT_ID && APS_CLIENT_SECRET) {
    console.log('║  ✅ Credenciales Autodesk CONFIGURADAS         ║');
  } else {
    console.log('║  ⚠️  Credenciales Autodesk NO configuradas      ║');
  }
  if (isDev) {
    console.log('║  🔧 MODO DESARROLLO ACTIVADO                   ║');
  }
  console.log('╚════════════════════════════════════════════════╝\n');
});
