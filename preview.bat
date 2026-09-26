@echo off
title OpenList ImageBed - Preview

echo.
echo ========================================
echo   OpenList ImageBed - Build & Preview
echo ========================================
echo.

:: Check Node.js
echo [1/4] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Download: https://nodejs.org/
    echo.
    goto :fail
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do echo   Node.js %%v OK

:: Enter app directory
echo.
echo [2/4] Entering project...
cd /d "%~dp0app"
if %errorlevel% neq 0 (
    echo [ERROR] Cannot enter app directory!
    goto :fail
)
echo   %cd%

:: Install deps if needed
echo.
echo [3/4] Checking dependencies...
if not exist "node_modules" (
    echo   Installing packages (first run)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed!
        goto :fail
    )
    echo   Done!
) else (
    echo   node_modules exists, skip.
)

:: Build
echo.
echo [4/4] Building production bundle...
npx vite build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    goto :fail
)
echo   Build OK!

:: Start preview
echo.
echo ========================================
echo   Starting preview server...
echo   Open: http://localhost:4173
echo   Press Ctrl+C to stop
echo ========================================
echo.

npx vite preview --host
goto :end

:fail
echo.
echo === Script exited with error ===
pause
exit /b 1

:end
echo.
echo Server stopped.
pause