param(
  [string]$DatabaseUrl
)

function Get-DatabaseUrlFromEnvFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $null }
  $content = Get-Content $Path -Raw
  $m = [regex]::Match($content, '(^|\r?\n)\s*DATABASE_URL\s*=\s*(.+)\s*($|\r?\n)')
  if (-not $m.Success) { return $null }
  $value = $m.Groups[2].Value.Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Trim('"') }
  if ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Trim("'") }
  return $value
}

if (-not $DatabaseUrl) { $DatabaseUrl = $env:DATABASE_URL }
if (-not $DatabaseUrl) { $DatabaseUrl = Get-DatabaseUrlFromEnvFile ".env.local" }

if (-not $DatabaseUrl) {
  throw "DATABASE_URL not found. Set `$env:DATABASE_URL or pass -DatabaseUrl, or add DATABASE_URL to .env.local."
}

$env:DATABASE_URL = $DatabaseUrl

Write-Host "Running drizzle push using DATABASE_URL from environment."
npm run db:push

