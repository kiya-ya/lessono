@echo off
chcp 65001 >nul
echo ========================================
echo  姐妹团数据看板 - 一键启动
echo ========================================
echo.

set "PROJECT_DIR=D:\姐妹团看板系统"
set "VENV_PY=%PROJECT_DIR%\.venv311\Scripts\python.exe"
set "VENV_PIP=%PROJECT_DIR%\.venv311\Scripts\pip.exe"

:: 检查虚拟环境
if not exist "%VENV_PY%" (
    echo [1/4] 创建虚拟环境...
    python -m venv "%PROJECT_DIR%\.venv311"
    if errorlevel 1 (
        echo ❌ 创建虚拟环境失败
        pause
        exit /b 1
    )
)

:: 安装依赖
echo [2/4] 检查依赖...
"%VENV_PY%" -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo    正在安装 flask, flask-cors, requests, beautifulsoup4...
    "%VENV_PIP%" install flask flask-cors requests beautifulsoup4 >nul 2>&1
)

:: 启动后端
echo [3/4] 启动 Flask 后端...
start /min "Flask后端" cmd /c "cd /d %PROJECT_DIR% && %VENV_PY% backend/app.py"

:: 等待服务启动
echo [4/4] 等待服务就绪...
timeout /t 3 /nobreak >nul

:: 检查端口
netstat -an | findstr "0.0.0.0:5000" >nul
if %errorlevel% equ 0 (
    echo.
    echo ✅ 服务已启动，正在打开浏览器...
    start http://localhost:5000/
    echo.
    echo 看板地址: http://localhost:5000/
    echo 按任意键关闭后端并退出...
    pause >nul
    taskkill /F /FI "WINDOWTITLE eq Flask后端" >nul 2>&1
    echo 后端已关闭
) else (
    echo ❌ 服务启动失败，请检查是否有其他程序占用 5000 端口
    pause
)
