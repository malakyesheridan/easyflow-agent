# Kill all processes on development ports
# Ports: 3000-3010 (Next.js), 4000-4010 (APIs/workers), 5173-5180 (Vite/tooling)

$ports = @()
$ports += 3000..3010  # Next.js apps
$ports += 4000..4010  # APIs / workers
$ports += 5173..5180  # Vite / tooling

$freedPorts = @()

Write-Host "Checking for processes on dev ports..." -ForegroundColor Cyan

foreach ($port in $ports) {
    try {
        # Find process using the port
        $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        
        if ($connection) {
            $processId = $connection.OwningProcess | Select-Object -First 1 -Unique
            
            if ($processId) {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                
                if ($process) {
                    Write-Host "  Killing process $($process.ProcessName) (PID: $processId) on port $port" -ForegroundColor Yellow
                    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                    $freedPorts += $port
                }
            }
        }
    } catch {
        # Port not in use or no permission - silently continue
    }
}

if ($freedPorts.Count -gt 0) {
    Write-Host "Freed ports: $($freedPorts -join ', ')" -ForegroundColor Green
} else {
    Write-Host "No processes found on dev ports" -ForegroundColor Green
}

Write-Host "Port cleanup complete" -ForegroundColor Cyan
