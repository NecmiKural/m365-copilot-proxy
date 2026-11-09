[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$Port,

    [string]$ConfigDir = (Join-Path $env:TEMP "m365-proxy-acceptance"),

    [string]$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,

    [ValidateSet("127.0.0.1", "::1")]
    [string]$HostAddress = "127.0.0.1",

    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

if ($SelfTest) {
    Assert-SafePort -Port 4142
    Assert-ProductionPortUntouched -Port 4142
    if (-not (Test-LoopbackAddress -Address $HostAddress)) { throw "Host validation failed." }
    Write-Output "SELF_TEST_OK"
    exit 0
}

Assert-SafePort -Port $Port
Assert-ProductionPortUntouched -Port $Port
$repo = Resolve-FullPath -Path $RepoDir
$config = Resolve-FullPath -Path $ConfigDir
$entry = Join-Path $repo "packages/proxy/bin/m365-proxy.mjs"

if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
    throw "Proxy entry point not found: $entry"
}
if (@(Get-PortListeners -Port $Port).Count -ne 0) {
    throw "Port $Port is already listening; start refused."
}

New-Item -ItemType Directory -Force -Path $config | Out-Null
$stdout = Join-Path $config "proxy-$Port.stdout.log"
$stderr = Join-Path $config "proxy-$Port.stderr.log"
$pidFile = Join-Path $config "proxy-$Port.pid"

if (Test-Path -LiteralPath $pidFile) {
    Remove-Item -LiteralPath $pidFile -Force
}

$old = @{
    HOST       = $env:HOST
    NITRO_HOST = $env:NITRO_HOST
    PORT       = $env:PORT
    NITRO_PORT = $env:NITRO_PORT
}
try {
    $env:HOST = $HostAddress
    $env:NITRO_HOST = $HostAddress
    $env:PORT = [string]$Port
    $env:NITRO_PORT = [string]$Port

    $child = Start-Process -FilePath "node.exe" `
        -ArgumentList @($entry, [string]$Port) `
        -WorkingDirectory $repo `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -WindowStyle Hidden `
        -PassThru
} finally {
    $env:HOST = $old.HOST
    $env:NITRO_HOST = $old.NITRO_HOST
    $env:PORT = $old.PORT
    $env:NITRO_PORT = $old.NITRO_PORT
}

$deadline = (Get-Date).AddSeconds(90)
do {
    Start-Sleep -Milliseconds 500
    $listeners = @(@(Get-PortListeners -Port $Port))
    if ($listeners.Count -gt 0) { break }
    if ($child.HasExited) {
        throw "Proxy exited before listening. See $stderr"
    }
} while ((Get-Date) -lt $deadline)

if ($listeners.Count -eq 0) {
    if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force }
    throw "Proxy did not listen on port $Port within 90 seconds."
}
if (@($listeners | Where-Object { -not (Test-LoopbackAddress $_.LocalAddress) }).Count -gt 0) {
    if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force }
    throw "Proxy bound outside loopback; process stopped."
}

$pids = @($listeners.OwningProcess | Sort-Object -Unique)
if ($pids.Count -ne 1) {
    throw "Expected one listener owner on port $Port; found: $($pids -join ', ')"
}
$owner = Get-ProcessDetails -ProcessId $pids[0]
if (-not (Test-M365ProxyCommandLine -CommandLine $owner.CommandLine)) {
    throw "Listener owner is not m365-proxy.mjs; PID file was not written."
}

Set-Content -LiteralPath $pidFile -Value $pids[0] -Encoding Ascii
Write-Output "STARTED_PORT=$Port"
Write-Output "LISTENER_PID=$($pids[0])"
Write-Output "LISTENER_ADDRESS=$($listeners.LocalAddress -join ',')"
Write-Output "PID_FILE=$pidFile"
