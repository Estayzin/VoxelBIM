const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║      Reiniciando servidor VoxelBIM                       ║');
console.log('║    (Cargando nueva API key de Claude)                    ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// Detener procesos node previos
console.log('🛑 Deteniendo procesos Node previos...');
try {
  execSync('wmic process where name="node.exe" delete /nointeractive', { stdio: 'ignore' });
  console.log('✅ Procesos terminados\n');
} catch (e) {
  console.log('⚠️  No había procesos node activos\n');
}

// Esperar
setTimeout(() => {
  console.log('🚀 Iniciando servidor...\n');
  
  // Iniciar el servidor principal
  const server = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname),
    stdio: 'inherit',
    shell: true
  });

  server.on('error', (err) => {
    console.error('❌ Error al iniciar servidor:', err);
  });
}, 1000);
