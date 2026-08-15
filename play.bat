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

echo Starting Steel Frontline...
call npm start
