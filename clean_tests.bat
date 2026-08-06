@echo off
chcp 65001 >nul 2>&1
echo ==========================================
echo   姐妹团看板系统 - 一键清理测试文件
echo ==========================================
echo.

set TEST_DIR=tests
set count=0

if not exist %TEST_DIR% (
    echo [INFO] tests 目录不存在，无需清理。
    goto :end
)

for %%f in (%TEST_DIR%\debug_uid_*.html) do (
    del /f "%%f" 2>nul
    set /a count+=1
)

for %%f in (%TEST_DIR%\check_*.py) do (
    del /f "%%f" 2>nul
    set /a count+=1
)

for %%f in (%TEST_DIR%\fix_*.py) do (
    del /f "%%f" 2>nul
    set /a count+=1
)

for %%f in (%TEST_DIR%\test_*.py) do (
    del /f "%%f" 2>nul
    set /a count+=1
)

if %count%==0 (
    echo [INFO] tests 目录中没有需要清理的测试文件。
) else (
    echo [OK] 已清理 %count% 个测试文件。
)

:end
echo.
echo 按任意键退出...
pause >nul
