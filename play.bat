@echo off & cd /d "%~dp0"

:: 依赖检查（首次运行自动安装）
if not exist "node_modules\three" (
  echo [首次运行] 正在安装依赖...
  call npm install || (echo 安装失败，请手动执行 npm install & pause & exit /b 1)
)

echo 正在启动钢铁前线...
call npm start
