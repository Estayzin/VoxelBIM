@echo off
REM Script para reiniciar el servidor Node con la nueva configuración

echo ╔═══════════════════════════════════════════════════════════╗
echo ║         Reiniciando servidor VoxelBIM                     ║
echo ║       (Cargando nueva API key de Claude)                 ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

REM Detener todos los procesos node.exe
echo 🛑 Deteniendo procesos Node previos...
wmic process where name="node.exe" delete /nointeractive >nul 2>&1

echo ⏳ Esperando...
timeout /t 1 /nobreak >nul

REM Iniciar el servidor
echo 🚀 Iniciando servidor...
cd /d "%~dp0"
node server.js

pause
