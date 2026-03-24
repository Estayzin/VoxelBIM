@echo off
echo.
echo ============================================================
echo  VoxelBIM — Build del visor
echo ============================================================
echo.

cd /d "%~dp0visor"

echo [1/2] Instalando dependencias (si faltan)...
call npm install

echo.
echo [2/2] Compilando visor con Vite...
call npm run build

echo.
if exist "%~dp0visor\dist\voxelbim.html" (
  echo  OK — visor/dist/ generado correctamente.
  echo  Ahora puedes iniciar el servidor con: node server.js
) else (
  echo  ERROR — No se genero el dist. Revisa los errores arriba.
)

echo.
pause
