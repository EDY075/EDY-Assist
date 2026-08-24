param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_TO')]
  [string]$Key
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'

if (-not (Test-Path -LiteralPath $envPath)) {
  throw 'Arquivo .env local não encontrado.'
}

try {
  $clipboardValue = Get-Clipboard -Raw
  if ([string]::IsNullOrWhiteSpace($clipboardValue)) {
    throw 'A área de transferência está vazia.'
  }

  $normalizedValue = switch ($Key) {
    'TWILIO_ACCOUNT_SID' {
      $match = [regex]::Match($clipboardValue, 'AC[a-fA-F0-9]{32}')
      if (-not $match.Success) { throw 'O SID copiado não tem o formato esperado.' }
      $match.Value
    }
    'TWILIO_AUTH_TOKEN' {
      $candidate = $clipboardValue.Trim()
      if ($candidate -notmatch '^[a-fA-F0-9]{32}$') { throw 'O Auth Token copiado não tem o formato esperado.' }
      $candidate
    }
    default {
      $match = [regex]::Match($clipboardValue, '(?:whatsapp:)?\+\d{8,15}')
      if (-not $match.Success) { throw 'O número copiado não tem o formato E.164 esperado.' }
      $digits = [regex]::Match($match.Value, '\+\d{8,15}').Value
      "whatsapp:$digits"
    }
  }

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.AddRange([string[]][IO.File]::ReadAllLines($envPath))
  $replacement = "$Key=$normalizedValue"
  $updated = $false

  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match "^$([regex]::Escape($Key))=") {
      $lines[$index] = $replacement
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    $lines.Add($replacement)
  }

  [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
  Write-Output "UPDATED:$Key"
}
finally {
  try { Set-Clipboard -Value ' ' } catch { }
}
