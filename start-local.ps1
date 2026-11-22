# Starts the existing FlowSense PostgreSQL service and local backend/frontend.
# Run from any directory:
#   powershell -ExecutionPolicy Bypass -File .\start-local.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "Starting FlowSense PostgreSQL..."
docker compose up -d db

$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    $status = docker inspect --format '{{.State.Health.Status}}' flowsense-db-1 2>$null
    if ($status -eq "healthy") {
        $healthy = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    throw "PostgreSQL did not become healthy."
}

Set-Location (Join-Path $root "backend")
& .\.venv\Scripts\python.exe -m alembic upgrade head

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host "Backend: http://127.0.0.1:8000"
Write-Host "Swagger: http://127.0.0.1:8000/docs"
Write-Host "Frontend: http://localhost:5173"
