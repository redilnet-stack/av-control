@echo off
title Jersey Systems AV Control (Build + Production)
cd /d "%~dp0"

echo.
echo   ============================================
echo     Jersey Systems — Build + Production Start
echo   ============================================
echo.

call npm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED — fix errors above, then retry.
  echo.
  pause
  exit /b 1
)

echo.
echo   Build OK. Starting production server...
echo.
call start-production.bat
