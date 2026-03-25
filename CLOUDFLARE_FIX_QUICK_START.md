# VoxelBIM en Cloudflare Pages - Fix Rápido

## 🔴 El Problema
```
ERROR: Cannot use 'import.meta' outside a module
```
El Web Worker no se cargaba como módulo ES6 en Cloudflare Pages.

## ✅ La Solución (Ya Implementada)

### Archivos Modificados:

**1. `_headers`** - MIME types para archivos .mjs
```
/*.mjs
  Content-Type: application/javascript
```

**2. `vite.config.js`** - Configuración de Vite para workers
```javascript
base: '/',
worker: { format: 'es' },
mimeTypes: { 'application/javascript': ['mjs', 'js'] }
```

**3. `visor/src/main.js`** - Cargar worker correctamente
```javascript
const workerUrl = _isLocal ? '/visor/dist/worker.mjs' : '/worker.mjs';
fragments.init(workerUrl, { classicWorker: false });
```

**4. `wrangler.toml`** - Configuración de Cloudflare
```toml
[site]
bucket = "./visor/dist"
```

## 🚀 Como Desplegar

### Local Testing
```bash
cd visor
npm run build
npm run postbuild  # automático si ejecutas build
```
Verifica que `visor/dist/worker.mjs` existe.

### Deploy a Cloudflare Pages
```bash
wrangler pages publish visor/dist
```

### O via GitHub (automático)
1. Push a GitHub
2. Cloudflare Pages build automáticamente
3. Build command: `cd visor && npm run build`

## 🧪 Como Verificar que Funciona

1. **Abre DevTools** (F12)
2. **Ve a Console tab**
3. Busca este mensaje:
```
[VoxelBIM] Initializing worker from: /worker.mjs
[VoxelBIM] Worker initialized successfully
```

4. Si ves el mensaje ✅, el problema está resuelto
5. Si ves un error, revisa que:
   - `worker.mjs` exista en dist/
   - El JSON sea válido
   - Network tab tenga `worker.mjs` como `application/javascript`

## 📋 Cambios Técnicos Resumidos

| Archivo | Cambio | Por qué |
|---------|--------|-------|
| `_headers` | MIME type para .mjs | Cloudflare debe servir como módulo |
| `vite.config.js` | base='/', worker config | Vite genera módulos ES6 válidos |
| `visor/src/main.js` | URL detection mejorada | Funciona en localhost y Cloudflare |
| `wrangler.toml` | [site] bucket | Cloudflare Pages publishes dist/ |

## ⚠️ Si Aún No Funciona

1. **Limpia el build**:
```bash
rm -rf visor/dist
cd visor
npm run build
npm run postbuild
```

2. **Verifica worker.mjs**:
```bash
ls -la visor/dist/worker.mjs  # Debe existir
file visor/dist/worker.mjs     # Debe ser "JavaScript"
```

3. **Check Network en Cloudflare**:
   - F12 → Network → busca worker.mjs
   - Response headers deben incluir: `Content-Type: application/javascript`

4. **Deploy fresh**:
```bash
wrangler pages publish visor/dist --project-name voxelbim --force
```

## 📚 Documentación Completa
Ver `CLOUDFLARE_PAGES_DEPLOYMENT.md` para instrucciones detalladas.
