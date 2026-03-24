const http = require('http');
const fs = require('fs');
const path = require('path');

// Cargar .env
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

console.log('═══════════════════════════════════════════════════════');
console.log('            TEST DE ENDPOINT /claude/chat               ');
console.log('═══════════════════════════════════════════════════════\n');

console.log('📋 Configuración:');
console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`  CLAUDE_API_KEY: ${process.env.CLAUDE_API_KEY ? '✅ CONFIGURADA' : '❌ NO CONFIGURADA'}`);
console.log();

const claudeBody = JSON.stringify({
  messages: [{
    role: 'user',
    content: '¿Cuál es la capital de Francia?'
  }]
});

const claudeOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/claude/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(claudeBody)
  }
};

console.log('📝 Enviando solicitud a /claude/chat...\n');

const claudeReq = http.request(claudeOptions, (claudeRes) => {
  console.log(`📥 Código de estado: ${claudeRes.statusCode}`);
  
  let data = '';
  claudeRes.on('data', chunk => {
    data += chunk;
  });
  
  claudeRes.on('end', () => {
    console.log(`\n✅ Respuesta recibida:\n`);
    if (data.length === 0) {
      console.log('⚠️  Respuesta vacía');
    } else {
      try {
        const json = JSON.parse(data);
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('JSON RAW:', data);
      }
    }
  });
});

claudeReq.on('error', (e) => {
  console.error('❌ Error:', e.message);
});

claudeReq.write(claudeBody);
claudeReq.end();

setTimeout(() => {
  console.log('\n⏱️  Timeout - sin respuesta');
  process.exit(1);
}, 8000);
