@echo off
chcp 65001 >nul
REM 姐妹团看板系统 - Windows 部署脚本
REM 用法: 双击运行，或 cmd 中执行 deploy.bat

echo =========================================
echo   姐妹团看板系统 - Windows 部署
echo =========================================
echo.

REM 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.11+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [1/4] Python 版本:
python --version
echo.

REM 检查依赖
echo [2/4] 检查依赖...
python -c "import flask, flask_cors, requests, bs4" >nul 2>&1
if errorlevel 1 (
    echo [提示] 依赖未安装，正在安装...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo [OK] 依赖已安装
)
echo.

REM 检查数据库
echo [3/4] 检查数据库...
if not exist data\stats.db (
    echo [提示] 数据库不存在，正在初始化...
    python init_db.py
    if errorlevel 1 (
        echo [错误] 数据库初始化失败
        pause
        exit /b 1
    )
) else (
    echo [OK] 数据库已存在
)
echo.

REM 启动服务
echo [4/4] 启动服务...
echo.
echo =========================================
echo   服务启动中...
echo   访问地址: http://127.0.0.1:5000
echo   按 Ctrl+C 停止服务
echo =========================================
echo.

python backend/app.py

pause
