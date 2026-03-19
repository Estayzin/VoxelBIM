/**
 * servidor.js — Revisor IFC
 * Uso: node servidor.js
 * Abre: http://localhost:3000/explorer.html
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.wasm': 'application/wasm',
  '.ifc':  'application/octet-stream',
  '.css':  'text/css',
  '.png':  'image/png',
  '.json': 'application/json',
};

http.createServer(function(req, res) {
  var url = req.url.split('?')[0];
  if (url === '/' || url === '') url = '/index.html';
  if (url === '/favicon.ico') { res.writeHead(204); return res.end(); }

  var file = path.join(ROOT, url);
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end('403'); }

  fs.readFile(file, function(err, data) {
    if (err) { res.writeHead(404); return res.end('404: ' + url); }
    var ext  = path.extname(file).toLowerCase();
    var mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type':                  mime,
      'Cross-Origin-Opener-Policy':    'same-origin',
      'Cross-Origin-Embedder-Policy':  'credentialless',
      'Cross-Origin-Resource-Policy':  'cross-origin',
    });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', function() {
  console.log('');
  console.log('  Servidor corriendo.');
  console.log('  Explorador: http://localhost:' + PORT + '/explorer.html');
  console.log('  Revisor:    http://localhost:' + PORT + '/revisor.html');
  console.log('');
});
