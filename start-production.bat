@echo off
title Jersey Systems AV Control (Production)
cd /d "%~dp0"

echo.
echo   ============================================
echo     Jersey Systems — AV Control (Production)
echo   ============================================
echo.
echo   Requires a build first:  npm run build
echo   (Run build-production.bat to build + start)
echo.
echo   Dashboard: http://localhost:3000
echo   Tunnel:    https://av.jerseysystems.com
echo.
echo   Close this window to stop the server.
echo   ============================================
echo.

cd backend
set NODE_ENV=production
node dist/index.js

pause
