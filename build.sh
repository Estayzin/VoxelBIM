#!/bin/bash
# Build script para Cloudflare Pages
# 1. Compila el visor con Vite
cd visor && npm install && npm run build && cd ..

# 2. Copia el dist del visor a /dist en la raiz
mkdir -p dist
cp -r visor/dist/* dist/visor/

# 3. Copia el resto del proyecto al dist
cp index.html dist/
cp _headers dist/
cp -r app dist/
