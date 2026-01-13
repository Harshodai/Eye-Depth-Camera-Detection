@echo off
echo ==========================================
echo      EyeVision Guard Safeguard System
echo ==========================================
echo.
echo [1/3] Opening Regression Suite in Browser...
start "" "c:\Users\khars\PycharmProjects\Eye-Depth-Camera-Detection\chrome-extension\tests\runner.html"

echo.
echo CHECK THE BROWSER WINDOW!
echo Are all tests showing as GREEN (Passed)?
echo.
set /p "choice=Enter 'y' if PASS, 'n' if FAIL: "

if /i "%choice%" neq "y" (
    echo.
    echo [ABORTED] Commit cancelled because tests did not pass.
    echo Please fix the issues and try again.
    pause
    exit /b 1
)

echo.
echo [2/3] Tests Passed. Proceeding to Commit...
echo.
set /p "msg=Enter your commit message: "

if "%msg%"=="" (
    echo.
    echo [ABORTED] Commit message cannot be empty.
    pause
    exit /b 1
)

echo.
echo [3/3] Pushing to Git...
call git add .
call git commit -m "%msg%"
call git push origin main

echo.
echo ==========================================
echo      SUCCESS! Changes pushed safely.
echo ==========================================
pause
