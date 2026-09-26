# OpenList ImageBed - Build & Preview (PowerShell)
# Right-click -> "Run with PowerShell"

$Host.UI.RawUI.WindowTitle = "OpenList ImageBed - Preview"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenList ImageBed - Build & Preview" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "[1/4] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = & node --version 2>&1
    Write-Host "  Node.js $nodeVersion OK" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Node.js not found!" -ForegroundColor Red
    Write-Host "  Download: https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Enter app directory
Write-Host ""
Write-Host "[2/4] Entering project..." -ForegroundColor Yellow
$appDir = Join-Path $PSScriptRoot "app"
if (-not (Test-Path $appDir)) {
    Write-Host "  [ERROR] app directory not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Set-Location $appDir
Write-Host "  $appDir" -ForegroundColor Gray

# Install deps if needed
Write-Host ""
Write-Host "[3/4] Checking dependencies..." -ForegroundColor Yellow
$nodeModules = Join-Path $appDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "  Installing packages (first run)..." -ForegroundColor Yellow
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERROR] npm install failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "  node_modules exists, skip." -ForegroundColor Gray
}

# Build
Write-Host ""
Write-Host "[4/4] Building production bundle..." -ForegroundColor Yellow
& npx vite build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Build failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  Build OK!" -ForegroundColor Green

# Start preview
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting preview server..." -ForegroundColor Cyan
Write-Host "  Open: http://localhost:4173" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

& npx vite preview --host

Write-Host ""
Write-Host "Server stopped." -ForegroundColor Yellow
Read-Host "Press Enter to exit"