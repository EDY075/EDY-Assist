$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.mobile-runtime'
$toolsDir = Join-Path $projectRoot 'tools'
$cloudflaredPath = Join-Path $toolsDir 'cloudflared.exe'
$cloudflaredVersion = '2026.8.2'
$cloudflaredSha256 = 'c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5'
$cloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/download/$cloudflaredVersion/cloudflared-windows-amd64.exe"
$apiStdout = Join-Path $runtimeDir 'api.stdout.log'
$apiStderr = Join-Path $runtimeDir 'api.stderr.log'
$tunnelStdout = Join-Path $runtimeDir 'tunnel.stdout.log'
$tunnelStderr = Join-Path $runtimeDir 'tunnel.stderr.log'
$qrPath = Join-Path $runtimeDir 'edy-assist-qr.svg'
$apiProcess = $null
$tunnelProcess = $null
$publicEdgeIp = $null

function Invoke-NpmStep([string]$Label, [string[]]$Arguments) {
  Write-Host "[EDY Assist] $Label..." -ForegroundColor Cyan
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Label falhou com código $LASTEXITCODE." }
}

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
    $stream.Dispose()
  }
}

function Stop-ProcessTree($Process) {
  if ($null -eq $Process -or $Process.HasExited) { return }
  & taskkill.exe /PID $Process.Id /T /F *> $null
}

function Wait-Health([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -eq 200) { return $true }
    } catch { Start-Sleep -Milliseconds 700 }
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Wait-PublicHealth([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  $uri = [uri]$Url
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -eq 200) { return $true }
    } catch { }

    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      $publicAddress = Resolve-DnsName -Name $uri.Host -Server '1.1.1.1' -Type A -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty IPAddress
      if ($publicAddress) {
        $resolve = "$($uri.Host):443:$publicAddress"
        $status = & curl.exe --silent --max-time 10 --output NUL --write-out '%{http_code}' --resolve $resolve $Url
        if ($status -eq '200') {
          $script:publicEdgeIp = $publicAddress
          return $true
        }
      }
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Read-QuickTunnelUrl {
  foreach ($path in @($tunnelStdout, $tunnelStderr)) {
    if (Test-Path -LiteralPath $path) {
      $content = Get-Content -Raw -LiteralPath $path
      if ([string]::IsNullOrWhiteSpace($content)) { continue }
      $match = [regex]::Match($content, 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($match.Success) { return $match.Value }
    }
  }
  return $null
}

try {
  Set-Location -LiteralPath $projectRoot
  Write-Host ''
  Write-Host 'EDY Assist — acesso móvel HTTPS' -ForegroundColor Magenta
  Write-Host 'Este fluxo expõe temporariamente a PWA e as rotas /api pelo Quick Tunnel.'
  Write-Host 'Mantenha esta janela, o computador e a internet ligados durante o uso.'
  Write-Host ''

  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js não foi encontrado. Instale o Node.js 20.19 ou superior.' }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm não foi encontrado junto com o Node.js.' }
  $nodeVersion = [version]((& node.exe --version).TrimStart('v'))
  if ($nodeVersion -lt [version]'20.19.0') { throw "Node.js $nodeVersion não é compatível. Use 20.19 ou superior." }

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
    Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination (Join-Path $projectRoot '.env')
    Write-Host '[EDY Assist] .env local criado a partir do exemplo sem credenciais.' -ForegroundColor Yellow
  }

  New-Item -ItemType Directory -Force -Path $runtimeDir, $toolsDir | Out-Null
  foreach ($log in @($apiStdout, $apiStderr, $tunnelStdout, $tunnelStderr)) {
    if (Test-Path -LiteralPath $log) { Remove-Item -LiteralPath $log -Force }
  }

  & npm.cmd ls --depth=0 --silent *> $null
  if ($LASTEXITCODE -ne 0) { Invoke-NpmStep 'Instalando somente dependências ausentes' @('install') }
  else { Write-Host '[EDY Assist] Dependências validadas.' -ForegroundColor Green }

  $schemaPath = Join-Path $projectRoot 'prisma\schema.prisma'
  $clientPath = Join-Path $projectRoot 'generated\prisma\client.ts'
  if (-not (Test-Path -LiteralPath $clientPath) -or (Get-Item -LiteralPath $schemaPath).LastWriteTimeUtc -gt (Get-Item -LiteralPath $clientPath).LastWriteTimeUtc) {
    Invoke-NpmStep 'Gerando Prisma Client' @('run', 'prisma:generate')
  } else { Write-Host '[EDY Assist] Prisma Client atualizado.' -ForegroundColor Green }

  Invoke-NpmStep 'Aplicando migrations incrementais no SQLite' @('run', 'db:init')
  Invoke-NpmStep 'Garantindo configuração inicial' @('run', 'db:seed')
  Invoke-NpmStep 'Gerando frontend de produção' @('run', 'build')

  if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
    Write-Host "[EDY Assist] Baixando cloudflared $cloudflaredVersion da fonte oficial..." -ForegroundColor Cyan
    Invoke-WebRequest -UseBasicParsing -Uri $cloudflaredUrl -OutFile $cloudflaredPath
  }
  $actualHash = Get-Sha256 $cloudflaredPath
  if ($actualHash -ne $cloudflaredSha256) { throw 'A validação SHA-256 do cloudflared falhou. O túnel não será iniciado.' }
  Write-Host '[EDY Assist] cloudflared oficial validado por SHA-256.' -ForegroundColor Green

  $occupied = Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue
  if ($occupied) { throw 'A porta 3333 já está em uso. Encerre o processo que ocupa essa porta e execute start-mobile.bat novamente.' }

  $oldNodeEnv = $env:NODE_ENV
  $oldHost = $env:HOST
  $env:NODE_ENV = 'production'
  $env:HOST = '127.0.0.1'
  try {
    $apiProcess = Start-Process -FilePath (Get-Command npm.cmd).Source -ArgumentList @('run', 'start:server') -WorkingDirectory $projectRoot -RedirectStandardOutput $apiStdout -RedirectStandardError $apiStderr -WindowStyle Hidden -PassThru
  } finally {
    $env:NODE_ENV = $oldNodeEnv
    $env:HOST = $oldHost
  }
  if (-not (Wait-Health 'http://127.0.0.1:3333/api/health' 45)) { throw "A API não iniciou. Consulte $apiStderr" }
  Write-Host '[EDY Assist] API e frontend de produção ativos na mesma origem local.' -ForegroundColor Green

  $tunnelProcess = Start-Process -FilePath $cloudflaredPath -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:3333', '--no-autoupdate') -WorkingDirectory $projectRoot -RedirectStandardOutput $tunnelStdout -RedirectStandardError $tunnelStderr -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(60)
  $publicUrl = $null
  do {
    if ($tunnelProcess.HasExited) { throw "O Quick Tunnel encerrou antes de gerar uma URL. Consulte $tunnelStderr" }
    $publicUrl = Read-QuickTunnelUrl
    if (-not $publicUrl) { Start-Sleep -Milliseconds 500 }
  } while (-not $publicUrl -and (Get-Date) -lt $deadline)
  if (-not $publicUrl) { throw "O Quick Tunnel não forneceu uma URL em 60 segundos. Consulte $tunnelStderr" }

  if (-not (Wait-PublicHealth "$publicUrl/api/health" 120)) { throw 'A URL HTTPS foi criada, mas a API não respondeu através do túnel em 120 segundos. Verifique DNS, firewall e conexão com a internet.' }
  if ($publicEdgeIp) {
    $publicHost = ([uri]$publicUrl).Host
    $manifestStatus = & curl.exe --silent --max-time 15 --output NUL --write-out '%{http_code}' --resolve "${publicHost}:443:$publicEdgeIp" "$publicUrl/manifest.webmanifest"
    if ($manifestStatus -ne '200') { throw 'O manifest da PWA não ficou acessível pela URL HTTPS.' }
  } else {
    $manifestResponse = Invoke-WebRequest -UseBasicParsing -Uri "$publicUrl/manifest.webmanifest" -TimeoutSec 15
    if ($manifestResponse.StatusCode -ne 200) { throw 'O manifest da PWA não ficou acessível pela URL HTTPS.' }
  }

  & node.exe (Join-Path $PSScriptRoot 'print-mobile-qr.mjs') $publicUrl $qrPath
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível gerar o QR Code.' }

  Write-Host ''
  Write-Host '============================================================' -ForegroundColor Magenta
  Write-Host 'EDY ASSIST PRONTO NO CELULAR' -ForegroundColor Green
  Write-Host $publicUrl -ForegroundColor Cyan
  Write-Host "QR Code salvo em: $qrPath"
  Write-Host 'Abra a URL ou escaneie o QR Code. No Chrome Android, use “Instalar app”.'
  Write-Host 'A URL é temporária e mudará quando este script for reiniciado.' -ForegroundColor Yellow
  Write-Host 'Pressione Ctrl+C para encerrar API e túnel.'
  Write-Host '============================================================' -ForegroundColor Magenta

  while (-not $apiProcess.HasExited -and -not $tunnelProcess.HasExited) { Start-Sleep -Seconds 2 }
  if ($apiProcess.HasExited) { throw 'A API foi encerrada inesperadamente.' }
  if ($tunnelProcess.HasExited) { throw 'O Quick Tunnel foi encerrado inesperadamente.' }
} catch {
  Write-Host ''
  Write-Host "[ERRO] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  Stop-ProcessTree $tunnelProcess
  Stop-ProcessTree $apiProcess
}
