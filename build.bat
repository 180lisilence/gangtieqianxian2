@echo off
cd /d "%~dp0"

if not exist "node_modules\three" (
    echo [First run] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo npm install failed. Run it manually.
        pause
        exit /b 1
    )
)

echo Building Steel Frontline EXE...
call npm run dist
if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
)

echo.
echo === Build done. Check dist5\ folder ===
dir /b dist5\*.exe 2>nul
echo.
pause
