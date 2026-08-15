@echo off
cd /d "%~dp0"

rem === Dependency check (auto install on first run) ===
if not exist "node_modules\three" (
  echo [first run] installing dependencies...
  call npm install
  if errorlevel 1 goto :err_install
)

echo building Steel Frontline EXE...
call npm run dist
if errorlevel 1 goto :err_build

echo.
echo [done] artifacts in dist5\:
dir /b dist5\*.exe 2>nul || echo (no exe found)
pause
goto :eof

:err_install
echo [FAIL] npm install failed. Run it manually and try again.
pause
exit /b 1

:err_build
echo [FAIL] build failed. See log above.
pause
exit /b 1
