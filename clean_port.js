const { execSync } = require('child_process');
const path = require('path');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║      Limpiando puerto 3000 y reiniciando                 ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

try {
  console.log('🔍 Buscando procesos en puerto 3000...');
  try {
    const output = execSync('netstat -ano | findstr :3000', { encoding: 'utf-8' });
    console.log('📊 Found:\n', output);
    
    // Extraer PID
    const pids = [];
    output.split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid) && pid !== 'PID') {
        pids.push(pid);
      }
    });
    
    if (pids.length > 0) {
      console.log(`\n🛑 Matando PIDs: ${pids.join(', ')}`);
      pids.forEach(pid => {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } catch (e) {}
      });
    }
  } catch (e) {
    console.log('ℹ️  Puerto 3000 ya está libre\n');
  }
  
  // Esperar um poco
  console.log('⏳ Esperando...');
  execSync('timeout /t 2', { stdio: 'ignore' });
  
  console.log('\n✅ Listo. Ahora ejecuta en PowerShell:\n');
  console.log('   cd d:\\Usuario\\Documents\\GitHub\\VoxelBIM ; node server.js\n');
  
} catch (e) {
  console.error('Error:', e.message);
}
