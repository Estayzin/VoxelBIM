/**
 * servidor.js — VoxelBIM
 * Uso: node servidor.js
 * Abre: http://localhost:3000
 */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = 3000;
const ROOT = require('path').resolve(__dirname, '..');

// ============================================================
// APS CONFIG — nunca expuesto al browser
// ============================================================
const APS_CLIENT_ID     = 'kOJ4igA0Lm8a9ZHA3KGkATKASthAdjiWBjY9ventTQBnGVab';
const APS_CLIENT_SECRET = 'GFwhQIEpFLUGFEfS5Iug0m8Q869JAhO9Dfk83L11BCPmuuVdwkv6GDOuBXvjBO2E';
const APS_CALLBACK_URL  = 'http://localhost:3000/app/autodesk.html';
const APS_TOKEN_URL     = 'https://developer.api.autodesk.com/authentication/v2/token';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.wasm': 'application/wasm',
  '.ifc':  'application/octet-stream',
  '.css':  'text/css',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
};

// ============================================================
// HELPER — petición HTTPS a Autodesk
// ============================================================
function apsPost(postData, callback) {
  const req = https.request({
    hostname: 'developer.api.autodesk.com',
    path:     '/authentication/v2/token',
    method:   'POST',
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    }
  }, function(res) {
    var body = '';
    res.on('data', function(c) { body += c; });
    res.on('end',  function()  { callback(null, res.statusCode, body); });
  });
  req.on('error', function(e) { callback(e); });
  req.write(postData);
  req.end();
}

// ============================================================
// SERVIDOR HTTP
// ============================================================
http.createServer(function(req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname;

  // CORS para llamadas locales
  res.setHeader('Access-Control-Allow-Origin',  'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ---- PROXY CLAUDE AI ----
  if (req.method === 'POST' && pathname === '/claude/chat') {
    var body = '';
    req.on('data', function(c) { body += c; });
    req.on('end', function() {
      var payload;
      try { payload = JSON.parse(body); } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'invalid json' }));
      }
      var postData = JSON.stringify(payload);
      var reqClaude = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'anthropic-version': '2023-06-01',
          'x-api-key': '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'
        }
      }, function(cr) {
        var rb = '';
        cr.on('data', function(c) { rb += c; });
        cr.on('end', function() {
          res.writeHead(cr.statusCode, { 'Content-Type': 'application/json' });
          res.end(rb);
        });
      });
      reqClaude.on('error', function(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      });
      reqClaude.write(postData);
      reqClaude.end();
    });
    return;
  }

  // ---- PROXY APS: intercambio code → token ----
  if (req.method === 'POST' && pathname === '/aps/token') {
    var body = '';
    req.on('data', function(c) { body += c; });
    req.on('end', function() {
      var code;
      try { code = JSON.parse(body).code; } catch(e) {}
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'missing code' }));
      }
      var postData = new URLSearchParams({
        grant_type:    'authorization_code',
        code:           code,
        redirect_uri:   APS_CALLBACK_URL,
        client_id:      APS_CLIENT_ID,
        client_secret:  APS_CLIENT_SECRET,
        scope:          'data:read viewables:read account:read bucket:read',
      }).toString();
      apsPost(postData, function(err, status, responseBody) {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(responseBody);
      });
    });
    return;
  }

  // ---- ARCHIVOS ESTÁTICOS ----
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }

  // Resolver rutas relativas a la raíz del proyecto
  var file = path.join(ROOT, pathname);
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end('403'); }

  fs.readFile(file, function(err, data) {
    if (err) { res.writeHead(404); return res.end('404: ' + pathname); }
    var ext  = path.extname(file).toLowerCase();
    var mime = MIME[ext] || 'application/octet-stream';
    // El visor de Autodesk necesita crossOriginIsolated para SharedArrayBuffer
    // Solo la página autodesk.html y sus assets del viewer usan require-corp
    // El resto usa credentialless para no romper otras rutas
    res.writeHead(200, {
      'Content-Type':                 mime,
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.end(data);
  });

}).listen(PORT, '127.0.0.1', function() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║         VoxelBIM — Servidor local     ║');
  console.log('  ╠═══════════════════════════════════════╣');
  console.log('  ║  Portal:      http://localhost:3000   ║');
  console.log('  ║  Explorador:  http://localhost:3000/visor/dist/voxelbim.html  ║');
  console.log('  ║  Autodesk:    http://localhost:3000/app/autodesk.html         ║');
  console.log('  ║  Proxy APS:   http://localhost:3000/aps/token                 ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
});
