#!/bin/bash
set -e

# 1. Compilar el visor con Vite
cd visor
npm install
npm run build
cd ..

# 2. Crear estructura del dist final
mkdir -p dist/visor

# 3. Copiar build del visor
cp -r visor/dist/* dist/visor/

# 4. Copiar portal principal y resto del proyecto
cp index.html dist/
cp _headers dist/
cp -r app dist/
