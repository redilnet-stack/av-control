@echo off
title Jersey Systems AV Control
cd /d "%~dp0"

echo.
echo   ============================================
echo     Jersey Systems — AV Control
echo   ============================================
echo.
echo   Starting backend (port 3000) and frontend (port 5173)...
echo.
echo   Dashboard: http://localhost:5173
echo   Settings:  http://localhost:5173/settings
echo.
echo   Close this window to stop all servers.
echo   ============================================
echo.

npm run dev

pause
