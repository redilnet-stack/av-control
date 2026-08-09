# Jersey Systems — Logon auto-start (NO ADMIN REQUIRED)
# Fallback persistence path: runs from the Windows Startup folder at logon.
# (The install-services.ps1 service/task path is the preferred boot-time option;
#  this covers the case where that wasn't installed yet.)
#
# Idempotent: skips the tunnel if cloudflared is already running for this
# tunnel, and skips the backend if localhost:3000 is already responding.
#
# Install: place a shortcut to this file in shell:startup, e.g.
#   powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File start-on-login.ps1

$ErrorActionPreference = "Continue"
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $rootDir "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $logDir "startup-$stamp.log"

function Log([string]$msg) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

Log "Jersey Systems logon auto-start begin"

# ── 1. Backend (production, localhost:3000) ────────────────────────────
$backendUp = $false
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/" -TimeoutSec 5 -UseBasicParsing
    $backendUp = ($r.StatusCode -eq 200)
} catch { $backendUp = $false }

if ($backendUp) {
    Log "Backend already responding on :3000 - skipping"
} else {
    Log "Starting production backend (crash-restart loop)..."
    $launcher = Join-Path $rootDir "start-production-background.ps1"
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`"" -WindowStyle Hidden
    Log "Backend launcher started"
}

# ── 2. Cloudflare tunnel (av.jerseysystems.com) ────────────────────────
$cfExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cfExe)) { $cfExe = "cloudflared" }

# Is cloudflared already running with this tunnel? (match by process cmdline)
$already = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "church-av-control" }

if ($already) {
    Log "Tunnel church-av-control already running (PID $($already.ProcessId)) - skipping"
} else {
    $cfg = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
    if (Test-Path $cfg) {
        Log "Starting cloudflared tunnel church-av-control (config: $cfg)..."
        Start-Process $cfExe -ArgumentList "--no-autoupdate","tunnel","run","church-av-control" -WindowStyle Hidden
        Log "cloudflared started"
    } else {
        Log "WARN: $cfg not found - tunnel not started"
    }
}

Log "Jersey Systems logon auto-start complete"
