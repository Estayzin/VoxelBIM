// Post-build patch: fixes Emscripten pthread worker URL in ES module context.
// document.currentScript.src is null for <script type="module">, causing pthread
// workers to spawn with URL "undefined" → MIME errors. Fix: fall back to import.meta.url.
// También copia index.html y app/ a dist/ para que Cloudflare Pages los sirva.
const fs   = require('fs');
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

  const SRC_ORIG = 'var e=globalThis.document?.currentScript?.src;';
  const SRC_FIX  = 'var e=globalThis.document?.currentScript?.src??import.meta.url;';
  if (code.includes(SRC_ORIG)) {
    code = code.replaceAll(SRC_ORIG, SRC_FIX);
    console.log('[patch] Fix 1: currentScript.src → import.meta.url fallback aplicado');
    patched = true;
  } else {
    console.warn('[patch] AVISO: patrón Fix 1 no encontrado');
  }

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

// 3. Copiar index.html (portal login) a dist/
const rootDir  = path.resolve(__dirname, '..');
const distDir  = path.resolve(__dirname, 'dist');

const indexSrc = path.join(rootDir, 'index.html');
if (fs.existsSync(indexSrc)) {
  fs.copyFileSync(indexSrc, path.join(distDir, 'index.html'));
  console.log('[patch] index.html copiado a dist/');
}

// 4. Copiar carpeta app/ a dist/app/ (explorador BIM + autodesk.html)
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '_archive') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

const appSrc  = path.join(rootDir, 'app');
const appDest = path.join(distDir, 'app');
if (fs.existsSync(appSrc)) {
  copyDir(appSrc, appDest);
  console.log('[patch] app/ copiado a dist/app/');
}

// 5. Copiar _headers y _redirects a dist/ para Cloudflare Pages
const headersSrc = path.join(rootDir, '_headers');
if (fs.existsSync(headersSrc)) {
  fs.copyFileSync(headersSrc, path.join(distDir, '_headers'));
  console.log('[patch] _headers copiado a dist/');
}
const redirectsSrc = path.join(rootDir, '_redirects');
if (fs.existsSync(redirectsSrc)) {
  fs.copyFileSync(redirectsSrc, path.join(distDir, '_redirects'));
  console.log('[patch] _redirects copiado a dist/');
}

console.log('[patch] Post-build completo ✓');
