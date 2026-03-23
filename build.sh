#!/bin/bash
set -e

# 1. Compilar el visor con Vite
cd visor
npm install
npm run build
cd ..

# 2. Copiar portal principal al dist del visor
cp index.html visor/dist/
