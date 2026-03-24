@echo off
echo.
echo ============================================================
echo  VoxelBIM — Servidor local
echo ============================================================
echo.

cd /d "%~dp0"

if not exist "visor\dist\voxelbim.html" (
  echo  ATENCION: visor/dist/ no existe. Ejecuta build.bat primero.
  echo.
  pause
  exit /b 1
)

echo  Iniciando servidor en http://localhost:3000
echo  Presiona Ctrl+C para detener.
echo.
node server.js
