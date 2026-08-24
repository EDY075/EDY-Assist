@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado. Instale o Node.js 20.19 ou superior.
  pause
  exit /b 1
)

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  if errorlevel 1 (
    echo [ERRO] Nao foi possivel criar o arquivo .env.
    pause
    exit /b 1
  )
  echo [EDY Assist] Arquivo .env local criado a partir de .env.example.
)

if not exist "node_modules" (
  echo [EDY Assist] Instalando dependencias...
  call npm install
  if errorlevel 1 goto :failure
)

echo [EDY Assist] Preparando Prisma e SQLite...
call npm run prisma:generate
if errorlevel 1 goto :failure
call npm run db:init
if errorlevel 1 goto :failure
call npm run db:seed
if errorlevel 1 goto :failure

echo [EDY Assist] Iniciando API e painel...
echo Painel: http://127.0.0.1:5173
echo API:    http://127.0.0.1:3333
call npm run dev
exit /b %errorlevel%

:failure
echo.
echo [ERRO] A inicializacao foi interrompida. Consulte QUICKSTART.md.
pause
exit /b 1
