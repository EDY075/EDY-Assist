$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $projectRoot 'tools'
$cloudflaredPath = Join-Path $toolsDir 'cloudflared.exe'
$cloudflaredVersion = '2026.8.2'
$cloudflaredSha256 = 'c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5'
$cloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/download/$cloudflaredVersion/cloudflared-windows-amd64.exe"

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
  Write-Host "Baixando cloudflared $cloudflaredVersion do repositório oficial..."
  Invoke-WebRequest -Uri $cloudflaredUrl -OutFile $cloudflaredPath
}

$actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $cloudflaredPath).Hash.ToLowerInvariant()
if ($actualSha256 -ne $cloudflaredSha256) {
  throw "Falha na verificação SHA-256 do cloudflared. Arquivo esperado: $cloudflaredSha256; recebido: $actualSha256"
}

Write-Host 'Abrindo túnel HTTPS somente para a API em http://127.0.0.1:3333'
Write-Host 'Mantenha esta janela aberta durante os testes do Twilio.'
& $cloudflaredPath tunnel --url http://127.0.0.1:3333 --no-autoupdate
