#!/bin/bash
set -e

# 1. Compilar el visor con Vite
cd visor
npm install
npm run build
cd ..

# 2. Copiar portal principal
cp index.html visor/dist/

# 3. Copiar carpeta app/ (autodesk.html, voxelbim.html, js/, src/, wasm/)
cp -r app visor/dist/app

# 4. Copiar _headers para que Cloudflare Pages aplique las cabeceras CORS/COOP
cp _headers visor/dist/_headers
