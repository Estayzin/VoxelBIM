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

// 2. Patch main bundle: fix Emscripten pthread workers in ES module context
const mainFile = files.find(f => f.startsWith('voxelbim-') && f.endsWith('.js'));
if (mainFile) {
  const filePath = path.join(assetsDir, mainFile);
  let code = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  // Fix 1: use import.meta.url as fallback when document.currentScript.src is null (ES module)
  const SRC_ORIG = 'var e=globalThis.document?.currentScript?.src;';
  const SRC_FIX  = 'var e=globalThis.document?.currentScript?.src??import.meta.url;';
  if (code.includes(SRC_ORIG)) {
    code = code.replaceAll(SRC_ORIG, SRC_FIX);
    console.log('[patch] Fix 1: currentScript.src → import.meta.url fallback aplicado');
    patched = true;
  } else {
    console.warn('[patch] AVISO: patrón Fix 1 no encontrado');
  }

  // Fix 2: create pthread workers as module workers (so import.meta works inside them)
  const WORKER_ORIG = 'new Worker(n,{name:`em-pthread`})';
  const WORKER_FIX  = 'new Worker(n,{name:`em-pthread`,type:`module`})';
  if (code.includes(WORKER_ORIG)) {
    code = code.replaceAll(WORKER_ORIG, WORKER_FIX);
    console.log('[patch] Fix 2: pthread workers → type:module aplicado');
    patched = true;
  } else {
    console.warn('[patch] AVISO: patrón Fix 2 no encontrado');
  }

  if (patched) {
    fs.writeFileSync(filePath, code, 'utf8');
    console.log('[patch] Bundle actualizado:', mainFile);
  }
}
