const https = require('https');

const body = JSON.stringify({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 50,
  messages: [{ role: 'user', content: 'hola' }]
});

const req = https.request({
  hostname: 'api.anthropic.com',
  path: '/v1/messages',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'anthropic-version': '2023-06-01',
    'x-api-key': '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'
  }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log('STATUS:', res.statusCode, '\nBODY:', data));
});

req.on('error', e => console.error('ERROR:', e.message));
req.write(body);
req.end();
