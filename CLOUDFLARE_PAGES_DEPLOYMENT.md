# Deployment a Cloudflare Pages

## Problema Resuelto
Error: `Cannot use 'import.meta' outside a module`

Esto ocurría porque el Web Worker (`worker.mjs`) no se servía como módulo ES6 en Cloudflare Pages.

## Configuración Necesaria

### 1. **Cloudflare Pages Config (`_headers`)**
El archivo `_headers` está en la raíz del proyecto e informa a Cloudflare sobre cómo servir los archivos:

```
/*.mjs
  Content-Type: application/javascript

/assets/*.mjs
  Content-Type: application/javascript

/worker.mjs
  Content-Type: application/javascript
```

✅ **Ya está configurado**

### 2. **Vite Config (`visor/vite.config.js`)**
- `base: '/'` - Rutas de raíz absoluta
- `worker.format: 'es'` - Workers como módulos ES6
- `mimeTypes` configurado correctamente

✅ **Ya está configurado**

### 3. **Worker Loading (`visor/src/main.js`)**
- Detecta automáticamente si es localhost o Cloudflare Pages
- Intenta cargar worker.mjs desde `/` en producción
- Tiene fallback si la carga falla

✅ **Ya está configurado**

## Pasos de Deployment

### Paso 1: Build Local
```bash
cd visor
npm install
npm run build
```

### Paso 2: Post-Build (automático)
```bash
npm run postbuild  # El script copia worker-*.mjs → dist/worker.mjs
```

Esto es automático en package.json debido a `"postbuild"` script.

### Paso 3: Deploy a Cloudflare Pages

**Opción A: Usando Wrangler (recomendado)**
```bash
wrangler pages publish visor/dist
```

**Opción B: GitHub Integration**
1. Push a GitHub
2. Cloudflare Pages se conecta automáticamente
3. Build automático: `npm run build` en carpeta `visor`

### Configuración en Cloudflare Pages Dashboard
Si usas GitHub integration:
- **Framework Preset**: None
- **Build command**: `cd visor && npm install && npm run build && npm run postbuild`
- **Build output directory**: `visor/dist`
- **Environment variables**: (ninguna necesaria)

## Verificación

### En el navegador (F12 Console):
```
[VoxelBIM] Initializing worker from: /worker.mjs
[VoxelBIM] Worker initialized successfully
```

### Errores Comunes y Soluciones

**Error: "Cannot use 'import.meta' outside a module"**
- ✅ Verifica que `_headers` tenga MIME type para `.mjs`
- ✅ Verifica que `worker.mjs` existe en `dist/`
- ✅ Verifica que el vite build finalizó correctamente

**Error 404 en worker.mjs**
- Asegúrate que `patch-build.cjs` copió el worker
- Revisa la carpeta `visor/dist` - debe haber un `worker.mjs`

**Worker no se inicializa**
- Abre las DevTools del navegador
- Verifica los logs en la consola
- Intenta recargar la página (Ctrl+Shift+R para hard refresh)

## Estructura de Archivos Post-Build

```
visor/dist/
├── index.html
├── voxelbim.html
├── worker.mjs                    ← IMPORTANTE: copiado por patch-build.cjs
├── web-ifc/
│   ├── ifc-schema.d.ts
│   ├── web-ifc-api.js
│   └── ...
└── assets/
    ├── voxelbim-abc123.js        ← Main bundle
    ├── worker-abc123.mjs         ← Original worker bundle (por Vite)
    └── ...
```

## Notas Técnicas

### `patch-build.cjs` (Post-Build Script)
Este script:
1. Copia `worker-*.mjs` → `dist/worker.mjs`
2. Parcheá el bundle principal para usar `import.meta.url` como fallback
3. Configura pthread workers como módulos ES6

### Por qué funciona ahora
- Cloudflare Pages sirve `worker.mjs` con el MIME type correcto
- El vite build genera módulos ES6 válidos
- El worker URL se resuelve correctamente en tiempo de ejecución
- `import.meta` está disponible dentro del worker porque se carga como módulo

## Troubleshooting Avanzado

### Si sigue fallando:
1. Verifica en DevTools → Network → busca `worker.mjs`
2. Haz clic en el archivo y ve la pestaña "Response"
3. Debería ver código JavaScript válido, no HTML de error
4. Verifica el header `Content-Type: application/javascript`

### Limpiar caché de Cloudflare
```bash
wrangler pages publish visor/dist --project-name voxelbim
```

Esto fuerza un re-deploy sin caché.
