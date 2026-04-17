@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install_whisper_windows.ps1"
if errorlevel 1 (
  echo.
  echo 설치 중 오류가 발생했습니다.
  pause
  exit /b 1
)
echo.
echo 설치가 끝났습니다.
echo MediaScribe 를 실행하면 런타임이 자동 복구됩니다.
pause
