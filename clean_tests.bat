@echo off
setlocal EnableDelayedExpansion

set "TEST_DIR=tests"
set count=0

if not exist "%TEST_DIR%" (
    echo [INFO] tests folder not found, skip.
    goto :end
)

echo ==========================================
echo   Clean Test Files
echo ==========================================
echo.

for %%f in (%TEST_DIR%\debug_uid_*.html) do (
    del /f "%%f" 2>nul
    if not exist "%%f" set /a count+=1
)

for %%f in (%TEST_DIR%\check_*.py) do (
    del /f "%%f" 2>nul
    if not exist "%%f" set /a count+=1
)

for %%f in (%TEST_DIR%\fix_*.py) do (
    del /f "%%f" 2>nul
    if not exist "%%f" set /a count+=1
)

for %%f in (%TEST_DIR%\test_*.py) do (
    del /f "%%f" 2>nul
    if not exist "%%f" set /a count+=1
)

if !count!==0 (
    echo [INFO] No test files to clean.
) else (
    echo [OK] Cleaned !count! test files.
)

:end
echo.
pause
endlocal
