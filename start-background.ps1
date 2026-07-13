# Jersey Systems — Background Launcher
# Launches both servers in hidden windows with logging.
# Run this with: powershell -ExecutionPolicy Bypass -File start-background.ps1

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $rootDir "logs"

# Create logs directory
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$beLog = Join-Path $logDir "backend-$timestamp.log"
$feLog = Join-Path $logDir "frontend-$timestamp.log"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Jersey Systems — AV Control" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Starting servers..."
Write-Host "  Dashboard: http://localhost:5173" -ForegroundColor Green
Write-Host "  Settings:  http://localhost:5173/settings" -ForegroundColor Green
Write-Host ""

# Start backend (visible window so you can see logs)
$beArgs = "-NoExit", "-Command", "cd '$rootDir/backend'; `$env:MOCK_DEVICES='true'; npm run dev *>> '$beLog'"
Start-Process -WindowStyle Normal -FilePath "powershell" -ArgumentList $beArgs -Verb RunAs

# Start frontend (visible window)
$feArgs = "-NoExit", "-Command", "cd '$rootDir/frontend'; npm run dev *>> '$feLog'"
Start-Process -WindowStyle Normal -FilePath "powershell" -ArgumentList $feArgs

Write-Host "  Logs: $logDir" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to close this window (servers keep running)..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
