# Clean Next.js build cache to avoid missing-chunk errors in dev (Windows can leave stale artifacts).

$nextDir = Join-Path (Get-Location) ".next"

if (-not (Test-Path $nextDir)) {
  Write-Host ".next directory not found; nothing to clean." -ForegroundColor Green
  exit 0
}

Write-Host "Cleaning .next directory..." -ForegroundColor Cyan

$attempts = 8
for ($i = 1; $i -le $attempts; $i++) {
  try {
    Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction Stop
    Write-Host ".next cleaned." -ForegroundColor Green
    exit 0
  } catch {
    if ($i -eq $attempts) {
      Write-Host "Failed to delete .next after $attempts attempts: $($_.Exception.Message)" -ForegroundColor Red
      exit 1
    }
    Start-Sleep -Milliseconds 250
  }
}

