# Jersey Systems — Production Backend (headless)
# Runs the production backend with crash-restart, logging to logs/.
# Used by the "JerseySystemsBackend" scheduled task (see install-services.ps1).
# Run manually with: powershell -ExecutionPolicy Bypass -File start-production-background.ps1

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $rootDir "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $logDir "backend-prod-$timestamp.log"

# Production environment — serves the built frontend on port 3000.
$env:NODE_ENV = "production"
$env:PORT = "3000"
$env:HOST = "0.0.0.0"

Set-Location (Join-Path $rootDir "backend")

Write-Host "Jersey Systems production backend -> http://localhost:3000 (log: $logFile)"

while ($true) {
    & node "dist/index.js" *>> $logFile
    $code = $LASTEXITCODE
    if ($code -eq 0) { break }
    Add-Content $logFile "[$(Get-Date)] Process exited with code $code - restarting in 5s"
    Start-Sleep -Seconds 5
}
