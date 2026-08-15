@echo off & cd /d "%~dp0"

:: 依赖检查（首次运行自动安装）
if not exist "node_modules\three" (
  echo [首次运行] 正在安装依赖...
  call npm install || (echo 安装失败，请手动执行 npm install & pause & exit /b 1)
)

echo 正在打包钢铁前线 EXE...
call npm run dist || (echo 打包失败 & pause & exit /b 1)

echo.
echo [完成] 产物在 dist5\ 目录下:
dir /b dist5\*.exe 2>nul || echo (未找到 exe)
pause
