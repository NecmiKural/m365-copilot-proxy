[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$Port,

    [string]$ConfigDir = (Join-Path $env:TEMP "m365-proxy-acceptance"),

    [string]$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,

    [ValidateSet("127.0.0.1", "::1")]
    [string]$HostAddress = "127.0.0.1",

    [string]$TaskNamePrefix = "M365 Copilot Proxy Acceptance",

    [ValidateRange(1, 60)]
    [int]$WatchdogIntervalMinutes = 2,

    [switch]$Apply,

    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

Assert-SafePort -Port $Port
Assert-ProductionPortUntouched -Port $Port

if ($SelfTest) {
    if ([string]::IsNullOrWhiteSpace($TaskNamePrefix)) {
        throw "Task-name validation failed."
    }
    if (-not (Test-LoopbackAddress -Address $HostAddress)) {
        throw "Host validation failed."
    }
    Write-Output "SELF_TEST_OK"
    exit 0
}

$repo = Resolve-FullPath -Path $RepoDir
$config = Resolve-FullPath -Path $ConfigDir
$startScript = Join-Path $PSScriptRoot "start.ps1"
$verifyScript = Join-Path $PSScriptRoot "verify-listener.ps1"
$stopScript = Join-Path $PSScriptRoot "stop.ps1"

foreach ($path in @($startScript, $verifyScript, $stopScript)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required lifecycle script not found: $path"
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $repo "packages/proxy/bin/m365-proxy.mjs") -PathType Leaf)) {
    throw "RepoDir does not contain packages/proxy/bin/m365-proxy.mjs: $repo"
}
if ([string]::IsNullOrWhiteSpace($TaskNamePrefix)) {
    throw "TaskNamePrefix must not be empty."
}

$proxyTaskName = "$TaskNamePrefix $Port"
$watchdogTaskName = "$TaskNamePrefix $Port Watchdog"
$powerShell = Join-Path $PSHOME "powershell.exe"

function Quote-TaskArgument {
    param([Parameter(Mandatory)][string]$Value)

    '"' + $Value.Replace('"', '\"') + '"'
}

$startArguments = @(
    "-NoLogo"
    "-NoProfile"
    "-NonInteractive"
    "-ExecutionPolicy Bypass"
    "-File $(Quote-TaskArgument $startScript)"
    "-Port $Port"
    "-ConfigDir $(Quote-TaskArgument $config)"
    "-RepoDir $(Quote-TaskArgument $repo)"
    "-HostAddress $HostAddress"
) -join " "

$watchdogCode = @"
`$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if (`$listeners.Count -eq 0) {
    Start-ScheduledTask -TaskName '$($proxyTaskName.Replace("'", "''"))'
}
"@
$watchdogPath = Join-Path $config "watchdog-$Port.ps1"
$watchdogArguments = @(
    "-NoLogo"
    "-NoProfile"
    "-NonInteractive"
    "-ExecutionPolicy Bypass"
    "-File $(Quote-TaskArgument $watchdogPath)"
) -join " "

$plan = [pscustomobject]@{
    Mode                    = if ($Apply) { "APPLY" } else { "WHAT_IF" }
    Port                    = $Port
    HostAddress             = $HostAddress
    ConfigDir               = $config
    RepoDir                 = $repo
    ProxyTaskName           = $proxyTaskName
    ProxyExecutable         = $powerShell
    ProxyArguments          = $startArguments
    WatchdogTaskName        = $watchdogTaskName
    WatchdogScript          = $watchdogPath
    WatchdogExecutable      = $powerShell
    WatchdogArguments       = $watchdogArguments
    WatchdogIntervalMinutes = $WatchdogIntervalMinutes
}
$plan | Format-List | Out-String | Write-Output

if (-not $Apply) {
    Write-Output "WHAT_IF_ONLY=True"
    Write-Output "No files or Scheduled Tasks were changed. Re-run with -Apply to apply this plan."
    exit 0
}

New-Item -ItemType Directory -Force -Path $config | Out-Null
Set-Content -LiteralPath $watchdogPath -Value $watchdogCode -Encoding UTF8

$proxyAction = New-ScheduledTaskAction `
    -Execute $powerShell `
    -Argument $startArguments `
    -WorkingDirectory $repo
$proxyTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$proxySettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew
$proxyTask = New-ScheduledTask `
    -Action $proxyAction `
    -Trigger $proxyTrigger `
    -Settings $proxySettings `
    -Description "Starts the loopback M365 Copilot proxy acceptance instance on port $Port."
Register-ScheduledTask `
    -TaskName $proxyTaskName `
    -InputObject $proxyTask `
    -User $env:USERNAME `
    -Force | Out-Null

$watchdogAction = New-ScheduledTaskAction `
    -Execute $powerShell `
    -Argument $watchdogArguments `
    -WorkingDirectory $repo
$watchdogTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $WatchdogIntervalMinutes)
$watchdogSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
$watchdogTask = New-ScheduledTask `
    -Action $watchdogAction `
    -Trigger $watchdogTrigger `
    -Settings $watchdogSettings `
    -Description "Restarts the M365 Copilot proxy acceptance task when port $Port is not listening."
Register-ScheduledTask `
    -TaskName $watchdogTaskName `
    -InputObject $watchdogTask `
    -User $env:USERNAME `
    -Force | Out-Null

Write-Output "TASKS_APPLIED=True"
Write-Output "PROXY_TASK=$proxyTaskName"
Write-Output "WATCHDOG_TASK=$watchdogTaskName"