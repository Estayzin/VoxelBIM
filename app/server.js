const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = 'C:/Users/Usuario/Documents/GitHub/VoxelBIM/APP';
const PORT = 3000;

const MIME = {
  html: 'text/html; charset=utf-8',
  js:   'application/javascript',
  css:  'text/css',
  png:  'image/png',
  jpg:  'image/jpeg',
  svg:  'image/svg+xml',
  json: 'application/json',
  ico:  'image/x-icon',
};

http.createServer((req, res) => {
  const url  = req.url.split('?')[0];
  const file = url === '/' ? '/autodesk.html' : url;
  const full = path.join(ROOT, file);

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + file);
      return;
    }
    const ext = full.split('.').pop().toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Servidor listo en http://localhost:' + PORT);
  console.log('Abre: http://localhost:' + PORT + '/autodesk.html');
});
