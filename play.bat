@echo off
cd /d "%~dp0"

rem === Dependency check (auto install on first run) ===
if not exist "node_modules\three" (
  echo [first run] installing dependencies...
  call npm install
  if errorlevel 1 goto :err_install
)

echo starting Steel Frontline...
call npm start
goto :eof

:err_install
echo [FAIL] npm install failed. Run it manually and try again.
pause
exit /b 1
