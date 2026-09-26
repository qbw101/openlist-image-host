@echo off
title OpenList ImageBed - Dev Server

echo.
echo ========================================
echo   OpenList ImageBed - Dev Server
echo ========================================
echo.

:: Check Node.js
echo [1/3] Checking Node.js...
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
echo [2/3] Entering project...
cd /d "%~dp0app"
if %errorlevel% neq 0 (
    echo [ERROR] Cannot enter app directory!
    goto :fail
)
echo   %cd%

:: Install deps if needed
echo.
echo [3/3] Checking dependencies...
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

:: Start dev server
echo.
echo ========================================
echo   Starting dev server...
echo   Open: http://localhost:5173
echo   Press Ctrl+C to stop
echo ========================================
echo.

npx vite --host
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