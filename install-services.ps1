# Jersey Systems — One-time infrastructure setup (RUN AS ADMINISTRATOR)
# 1. Installs cloudflared as a Windows service (auto-start on boot)
# 2. Registers the production backend as a scheduled task (auto-start + restart on crash)
#
# Usage: right-click -> Run with PowerShell, or:
#   powershell -ExecutionPolicy Bypass -File install-services.ps1

# ── Elevate if not admin ─────────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Restarting with administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cfExe)) { $cfExe = "cloudflared" }

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    Jersey Systems - Infrastructure Setup" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. cloudflared as a Windows service (config-file mode) ───────────
# No token is passed, so the service runs in config-file mode: on startup it
# reads the config file baked in below, which selects the tunnel by ID
# (church-av-control / 7b4007a3-...) and loads the matching credentials file.
# Ingress rules live in the same config.yml (av.jerseysystems.com -> localhost:3000),
# so NO dashboard Public Hostname record is required.
# Note: the service runs as LocalSystem, so ~ would resolve to the SYSTEM
# profile - we therefore pass the ABSOLUTE config path via --config.
Write-Host "[1/2] Installing cloudflared Windows service..." -ForegroundColor Green
$cfDir = Join-Path $env:USERPROFILE ".cloudflared"
$configPath = Join-Path $cfDir "config.yml"
$credFile = $null
if (Test-Path $configPath) {
    $m = Select-String -Path $configPath -Pattern "^\s*credentials-file:\s*(.+)$"
    if ($m) { $credFile = $m.Matches[0].Groups[1].Value.Trim() }
}
if (-not (Test-Path $configPath)) {
    Write-Host "  $configPath not found - skipping service install." -ForegroundColor Red
} elseif (-not $credFile -or -not (Test-Path $credFile)) {
    Write-Host "  credentials file for tunnel not found (config: $configPath) - skipping service install." -ForegroundColor Red
} else {
    & $cfExe --config $configPath service install
    if ($LASTEXITCODE -eq 0) { Write-Host "  cloudflared service installed (config: $configPath)." -ForegroundColor Cyan }
    else { Write-Host "  cloudflared service install FAILED (exit $LASTEXITCODE)." -ForegroundColor Red }
}

# ── 2. Backend scheduled task (auto-start at boot, restart on crash) ─
Write-Host "[2/2] Registering backend scheduled task..." -ForegroundColor Green
$taskName = "JerseySystemsBackend"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$rootDir\start-production-background.ps1`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
Write-Host "  Scheduled task '$taskName' registered." -ForegroundColor Cyan

# ── 3. Start everything now ──────────────────────────────────────────
Write-Host ""
Write-Host "Starting services now..." -ForegroundColor Green
Start-Service -Name "cloudflared" -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  Done. Tunnel: https://av.jerseysystems.com" -ForegroundColor Cyan
Write-Host "  (Requires the Public Hostname record in the Cloudflare dashboard first.)"
Write-Host ""
Read-Host "Press Enter to close"
