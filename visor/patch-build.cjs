// Post-build patch: fixes Emscripten pthread worker URL in ES module context.
// document.currentScript.src is null for <script type="module">, causing pthread
// workers to spawn with URL "undefined" → MIME errors. Fix: fall back to import.meta.url.
const fs = require('fs');
const path = require('path');

const assetsDir = 'dist/assets';
const files = fs.readdirSync(assetsDir);

// 1. Copy compiled worker bundle to dist/worker.mjs
const workerFile = files.find(f => f.startsWith('worker-') && f.endsWith('.mjs'));
if (workerFile) {
  fs.copyFileSync(path.join(assetsDir, workerFile), 'dist/worker.mjs');
  console.log('[patch] worker.mjs actualizado:', workerFile);
}

// 2. Patch main bundle: fix Emscripten document.currentScript.src → import.meta.url fallback
const mainFile = files.find(f => f.startsWith('voxelbim-') && f.endsWith('.js'));
if (mainFile) {
  const filePath = path.join(assetsDir, mainFile);
  let code = fs.readFileSync(filePath, 'utf8');
  const ORIGINAL = 'var e=globalThis.document?.currentScript?.src;';
  const PATCHED  = 'var e=globalThis.document?.currentScript?.src??import.meta.url;';
  if (code.includes(ORIGINAL)) {
    code = code.replace(ORIGINAL, PATCHED);
    fs.writeFileSync(filePath, code, 'utf8');
    console.log('[patch] Emscripten pthread URL fix aplicado:', mainFile);
  } else {
    console.warn('[patch] AVISO: patrón Emscripten no encontrado en', mainFile, '- puede que el bundle cambió');
  }
}
