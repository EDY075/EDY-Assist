@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-twilio-tunnel.ps1"
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar o tunel do Twilio.
  pause
  exit /b 1
)

endlocal
