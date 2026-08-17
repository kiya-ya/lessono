@echo off
chcp 65001 >nul
echo ==========================================
echo   姐妹团数据定时任务配置
echo ==========================================
echo.

cd /d "D:\姐妹团看板系统"

echo [1/2] 检测环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未检测到 python，请安装 Python 并加入环境变量
    pause
    exit /b 1
)
echo [OK] Python 可用

echo.
echo [2/2] 创建计划任务...
schtasks /delete /tn "姐妹团数据自动抓取" /f >nul 2>&1
schtasks /create /tn "姐妹团数据自动抓取" /tr "cmd /c cd /d D:\姐妹团看板系统 && .venv311\Scripts\python.exe daily_crawl.py >> data\crawl_log.txt 2>&1" /sc daily /st 10:00 /f

if errorlevel 1 (
    echo [ERROR] 创建失败，请尝试右键【以管理员身份运行】
    echo 或使用方法：Win+R 输入 taskschd.msc 手动创建
) else (
    echo [OK] 任务创建成功！每天 10:00 自动运行
)

echo.
pause
