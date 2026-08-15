@echo off
REM ================================================
REM  开发快速启动 (不打 EXE, 直接跑 Java 启动器)
REM ================================================
cd /d %~dp0
java -version
if errorlevel 1 ( echo 请先安装 JDK 17+ & pause & exit /b 1 )
echo 正在编译 Java...
if not exist launcher\target\classes mkdir launcher\target\classes
dir /b /s launcher\src\main\java\*.java > "%TEMP%\sources.txt"
javac -encoding UTF-8 -d launcher\target\classes @"%TEMP%\sources.txt"
if errorlevel 1 ( echo 编译失败 & pause & exit /b 2 )
echo 拷贝游戏静态资源到 classpath...
xcopy /E /I /Y css "%~dp0launcher\target\classes\game\css\" >nul
xcopy /E /I /Y js  "%~dp0launcher\target\classes\game\js\"  >nul
copy /Y index.html "%~dp0launcher\target\classes\game\index.html" >nul
echo 启动...
java -cp launcher\target\classes com.steelfrontline.launcher.SteelFrontlineLauncher
