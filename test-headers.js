// test-headers.js — pega esto en la consola del navegador para verificar si COOP/COEP están activos
console.log('crossOriginIsolated:', window.crossOriginIsolated);
console.log('SharedArrayBuffer disponible:', typeof SharedArrayBuffer !== 'undefined');
