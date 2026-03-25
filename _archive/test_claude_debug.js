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
console.log('      DEBUG: TEST CON DETALLE DE RESPUESTA               ');
console.log('═══════════════════════════════════════════════════════\n');

console.log('📋 Configuración:');
console.log(`  CLAUDE_API_KEY longitud: ${process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.length : 0}`);
console.log(`  CLAUDE_API_KEY primeros 20 chars: ${process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.substring(0, 20) : 'N/A'}`);
console.log();

const claudeBody = JSON.stringify({
  messages: [{
    role: 'user',
    content: 'Hola, ¿cómo estás?'
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

console.log('📝 Enviar a: http://localhost:3000/claude/chat\n');

const claudeReq = http.request(claudeOptions, (claudeRes) => {
  console.log(`📥 Status: ${claudeRes.statusCode}`);
  console.log(`📥 Headers:`, claudeRes.headers);
  console.log();
  
  let data = '';
  claudeRes.on('data', chunk => {
    data += chunk;
  });
  
  claudeRes.on('end', () => {
    console.log(`✅ Respuesta RAW:\n${data}\n`);
    
    try {
      const json = JSON.parse(data);
      console.log('✅ JSON Parseado:');
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('❌ No es JSON válido');
    }
  });
});

claudeReq.on('error', (e) => {
  console.error('❌ Error:', e.message);
});

claudeReq.write(claudeBody);
claudeReq.end();

setTimeout(() => {
  process.exit(0);
}, 8000);
