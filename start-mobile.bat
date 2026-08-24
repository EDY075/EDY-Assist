@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-mobile.ps1"
set "EDY_MOBILE_EXIT=%errorlevel%"
if not "%EDY_MOBILE_EXIT%"=="0" (
  echo.
  echo A inicializacao movel falhou. Revise a mensagem acima e os logs em .mobile-runtime.
  pause
)
exit /b %EDY_MOBILE_EXIT%
