import { resolve } from 'path';

export default {
  // base vacío = rutas relativas → funciona tanto en servidor local como en Cloudflare Pages
  base: '/',
  publicDir: 'public',
  server: {
    middlewareMode: false,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    mimeTypes: {
      'application/wasm': ['wasm'],
      'application/javascript': ['mjs', 'js']
    }
  },
  optimizeDeps: {
    rolldownOptions: {
      format: 'esm',
      target: 'esnext'
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist'),   // → visor/dist/
    target: 'esnext',
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      input: resolve(__dirname, 'voxelbim.html'),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      }
    },
    assetsInlineLimit: 0,
    sourcemap: false,
    minify: true,
  }
};
