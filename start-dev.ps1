# Codeway local dev launcher
# Usage: open PowerShell in the project root and run:  .\start-dev.ps1
# Opens two extra windows: backend API (:3000) and frontend dev server (:5173).
# Close a window to stop that service.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host '=== Codeway local dev ===' -ForegroundColor Cyan

# 1) Database
Write-Host '[1/3] Checking PostgreSQL container...' -ForegroundColor Yellow
docker compose -f "$root\docker-compose.yml" up -d postgres
$dbReady = $false
foreach ($i in 1..20) {
    Start-Sleep -Seconds 2
    $state = docker inspect -f '{{.State.Health.Status}}' tongluxing-postgres 2>$null
    if ($state -eq 'healthy') { $dbReady = $true; break }
    Write-Host ("  waiting for database... ({0}/20)" -f $i)
}
if (-not $dbReady) {
    Write-Host 'Database failed to start. Make sure Docker Desktop is running, then retry.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}
Write-Host '  database ready' -ForegroundColor Green

# 2) Backend in its own window
Write-Host '[2/3] Starting backend API on port 3000...' -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "cd '$root\apps\api'; `$host.UI.RawUI.WindowTitle='Codeway API 3000'; npm run start:dev"
)

# 3) Frontend in its own window
Write-Host '[3/3] Starting frontend dev server on port 5173...' -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "cd '$root\apps\web'; `$host.UI.RawUI.WindowTitle='Codeway Web 5173'; npm run dev"
)

Write-Host ''
Write-Host 'Both services are starting in separate windows (first compile takes 10-30s).' -ForegroundColor Cyan
Write-Host 'When ready, open: http://localhost:5173' -ForegroundColor Green
Write-Host ''
Write-Host 'Stop services: close those two windows.' -ForegroundColor DarkGray
Write-Host 'Stop database: docker compose down' -ForegroundColor DarkGray
