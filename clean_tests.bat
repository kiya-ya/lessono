@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
echo ==========================================
echo   姐妹团看板系统 - 一键清理测试文件
echo ==========================================
echo.

set "TEST_DIR=tests"
set count=0

if not exist "%TEST_DIR%" (
    echo [INFO] tests 目录不存在，无需清理。
    goto :end
)

echo [INFO] 正在清理 %TEST_DIR% 目录...

:: 删除 debug_uid_*.html
for %%f in (%TEST_DIR%\debug_uid_*.html) do (
    del /f "%%f" 2>nul
    if exist "%%f" (
        echo [WARN] 无法删除: %%f
    ) else (
        set /a count+=1
        echo [DEL] %%f
    )
)

:: 删除 check_*.py
for %%f in (%TEST_DIR%\check_*.py) do (
    del /f "%%f" 2>nul
    if not exist "%%f" set /a count+=1
)

:: 删除 fix_*.py
for %%f in (%TEST_DIR%\fix_*.py) do (
    del /f "%%f" 2>nul
    if not exist "%%f" set /a count+=1
)

:: 删除 test_*.py
for %%f in (%TEST_DIR%\test_*.py) do (
    del /f "%%f" 2>nul
    if not exist "%%f" set /a count+=1
)

echo.
if !count!==0 (
    echo [INFO] 没有需要清理的测试文件。
) else (
    echo [OK] 已清理 !count! 个测试文件。
)

:end
echo.
echo 按任意键退出...
pause >nul
endlocal
