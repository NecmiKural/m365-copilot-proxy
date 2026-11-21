[CmdletBinding(SupportsShouldProcess)]
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
    if (Test-M365ProxyCommandLine -CommandLine "node other.mjs 4142") {
        throw "Ownership negative self-test failed."
    }
    if (-not (Test-M365ProxyCommandLine -CommandLine "node packages/proxy/bin/m365-proxy.mjs 4142")) {
        throw "Ownership positive self-test failed."
    }
    Write-Output "SELF_TEST_OK"
    exit 0
}

Assert-SafePort -Port $Port
Assert-ProductionPortUntouched -Port $Port
$null = Resolve-FullPath -Path $RepoDir
$config = Resolve-FullPath -Path $ConfigDir
$pidFile = Join-Path $config "proxy-$Port.pid"

$listeners = @(@(Get-PortListeners -Port $Port))
if ($listeners.Count -eq 0) {
    Write-Output "PORT_ALREADY_CLOSED=$Port"
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
    exit 0
}

$pids = @($listeners.OwningProcess | Sort-Object -Unique)
if ($pids.Count -ne 1) {
    throw "Refusing to stop: port $Port has multiple listener owners: $($pids -join ', ')"
}
$listenerPid = [int]$pids[0]
$process = Get-ProcessDetails -ProcessId $listenerPid
if (-not (Test-M365ProxyCommandLine -CommandLine $process.CommandLine)) {
    throw "Refusing to stop PID ${listenerPid}: its command line is not m365-proxy.mjs."
}
if (Test-Path -LiteralPath $pidFile) {
    $recorded = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
    if ($recorded -ne $listenerPid) {
        throw "Refusing to stop PID ${listenerPid}: PID file records $recorded."
    }
}

if ($PSCmdlet.ShouldProcess("PID $listenerPid listening on port $Port", "Stop m365-proxy.mjs")) {
    Stop-Process -Id $listenerPid
    $deadline = (Get-Date).AddSeconds(15)
    do {
        Start-Sleep -Milliseconds 250
        $remaining = @(@(Get-PortListeners -Port $Port))
    } while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)

    if ($remaining.Count -gt 0) {
        throw "PID $listenerPid did not release port $Port."
    }
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
}
Write-Output "STOPPED_PORT=$Port"
Write-Output "STOPPED_PID=$listenerPid"
