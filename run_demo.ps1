# Aditya-L1 Solar Flare Early Warning System — Unified Hackathon Demo Launcher
# Launches the full space-ground telemetry chain in separate windows.

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "     LAUNCHING END-TO-END HACKATHON LIVE DEMONSTRATION" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan

# 1. Clean port 8000 and port 3000 to avoid winerror conflicts
Write-Host "Cleaning up active network sockets..." -ForegroundColor Yellow
$p8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($p8000) {
    Stop-Process -Id $p8000.OwningProcess -Force -ErrorAction SilentlyContinue
}
$p3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($p3000) {
    Stop-Process -Id $p3000.OwningProcess -Force -ErrorAction SilentlyContinue
}

# 2. Launch processes in separate windows
Write-Host "Starting FastAPI Backend API (Port 8000)..." -ForegroundColor Green
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Title 'FastAPI Backend API Server'; .venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000" -PassThru

Write-Host "Starting Ground Station CCSDS Binary Parser (UDP 9000)..." -ForegroundColor Green
$parser = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Title 'CCSDS Ground Telemetry Parser'; .venv\Scripts\python.exe backend/ccsds_parser.py" -PassThru

Write-Host "Starting Next.js Telemetry Dashboard (Port 3000)..." -ForegroundColor Green
$dashboard = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Title 'Next.js Frontend dev'; cd dashboard; npm run dev" -PassThru

Write-Host "Waiting 8 seconds for application servers to spin up..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

Write-Host "Starting Aditya-L1 Satellite Downlink Simulator..." -ForegroundColor Green
$simulator = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Title 'Aditya-L1 Satellite Downlink Simulator'; .venv\Scripts\python.exe backend/ccsds_simulator.py --speed 1.5" -PassThru

Write-Host "--------------------------------------------------------------" -ForegroundColor Cyan
Write-Host " DEMO RUNNING: Open http://127.0.0.1:3000 in your web browser!" -ForegroundColor Green
Write-Host "--------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "Press ENTER in this window to stop all servers and terminate the demo." -ForegroundColor Magenta

Read-Host

Write-Host "Stopping all background servers..." -ForegroundColor Yellow
Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $parser.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $dashboard.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $simulator.Id -Force -ErrorAction SilentlyContinue

Write-Host "Demo terminated successfully." -ForegroundColor Green
