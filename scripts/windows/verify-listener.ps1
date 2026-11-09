[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$Port,

    [string]$ConfigDir = (Join-Path $env:TEMP "m365-proxy-acceptance"),

    [string]$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,

    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

if ($SelfTest) {
    Assert-SafePort -Port 4142
    Assert-ProductionPortUntouched -Port 4142
    if (-not (Test-LoopbackAddress -Address "127.0.0.1")) { throw "IPv4 loopback self-test failed." }
    if (Test-LoopbackAddress -Address "0.0.0.0") { throw "Wildcard self-test failed." }
    Write-Output "SELF_TEST_OK"
    exit 0
}

Assert-SafePort -Port $Port
Assert-ProductionPortUntouched -Port $Port
$null = Resolve-FullPath -Path $ConfigDir
$null = Resolve-FullPath -Path $RepoDir

$listeners = @(@(Get-PortListeners -Port $Port))
if ($listeners.Count -eq 0) {
    [Console]::Error.WriteLine("No process is listening on port $Port.")
    exit 2
}

$badAddress = $false
$rows = foreach ($listener in $listeners) {
    $process = Get-ProcessDetails -ProcessId $listener.OwningProcess
    $loopback = Test-LoopbackAddress -Address $listener.LocalAddress
    if (-not $loopback) { $badAddress = $true }

    [pscustomobject]@{
        Port        = $Port
        Address     = $listener.LocalAddress
        Loopback    = $loopback
        PID         = $listener.OwningProcess
        ProcessName = $process.Name
        CommandLine = $process.CommandLine
    }
}
$rows | Format-Table -AutoSize | Out-String | Write-Output

if ($badAddress) {
    Write-Error "Port $Port has a wildcard or non-loopback listener."
    exit 3
}

try {
    $health = Invoke-JsonRequest -Method GET -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 10
} catch {
    Write-Error "Health request failed: $($_.Exception.Message)"
    exit 4
}

Write-Output "HEALTH_STATUS=$([int]$health.StatusCode)"
if ([int]$health.StatusCode -ne 200) {
    exit 5
}
exit 0
