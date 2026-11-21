[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$Port,

    [string]$ConfigDir = (Join-Path $env:TEMP "m365-proxy-acceptance"),

    [string]$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,

    [string]$Model = "gpt-5.5-think-deeper",

    [string]$Sentinel = "PHASE12_SMOKE_OK",

    [string]$ApiKeyEnvVar = "M365_API_KEY",

    [int]$TimeoutSec = 120,

    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

if ($SelfTest) {
    Assert-SafePort -Port 4142
    Assert-ProductionPortUntouched -Port 4142
    if ([string]::IsNullOrWhiteSpace($Sentinel)) { throw "Sentinel validation failed." }
    Write-Output "SELF_TEST_OK"
    exit 0
}

Assert-SafePort -Port $Port
Assert-ProductionPortUntouched -Port $Port
$null = Resolve-FullPath -Path $ConfigDir
$null = Resolve-FullPath -Path $RepoDir

if ([string]::IsNullOrWhiteSpace($Sentinel)) {
    throw "Sentinel must not be empty."
}
$headers = @{}
$apiKey = [Environment]::GetEnvironmentVariable($ApiKeyEnvVar)
if (-not [string]::IsNullOrWhiteSpace($apiKey)) {
    $headers.Authorization = "Bearer $apiKey"
}

$baseUri = "http://127.0.0.1:$Port"
try {
    $modelsResponse = Invoke-JsonRequest `
        -Method GET `
        -Uri "$baseUri/v1/models" `
        -Headers $headers `
        -TimeoutSec ([Math]::Min($TimeoutSec, 30))
} catch {
    Write-Error "GET /v1/models failed: $($_.Exception.Message)"
    exit 2
}

if ([int]$modelsResponse.StatusCode -ne 200) {
    Write-Error "GET /v1/models returned HTTP $([int]$modelsResponse.StatusCode)."
    exit 3
}

try {
    $models = $modelsResponse.Content | ConvertFrom-Json
} catch {
    Write-Error "GET /v1/models did not return valid JSON."
    exit 4
}
if ($null -eq $models.data -or @($models.data).Count -eq 0) {
    Write-Error "GET /v1/models returned no models."
    exit 5
}
Write-Output "MODELS_STATUS=200"
Write-Output "MODEL_COUNT=$(@($models.data).Count)"

$payload = @{
    model       = $Model
    stream      = $false
    temperature = 0
    max_tokens  = 64
    messages    = @(
        @{
            role    = "user"
            content = "Reply with exactly this text and nothing else: $Sentinel"
        }
    )
} | ConvertTo-Json -Depth 8 -Compress

try {
    $chatResponse = Invoke-JsonRequest `
        -Method POST `
        -Uri "$baseUri/v1/chat/completions" `
        -Headers $headers `
        -Body $payload `
        -TimeoutSec $TimeoutSec
} catch {
    Write-Error "POST /v1/chat/completions failed: $($_.Exception.Message)"
    exit 6
}

if ([int]$chatResponse.StatusCode -ne 200) {
    Write-Error "POST /v1/chat/completions returned HTTP $([int]$chatResponse.StatusCode)."
    exit 7
}

try {
    $chat = $chatResponse.Content | ConvertFrom-Json
    $actual = [string]$chat.choices[0].message.content
} catch {
    Write-Error "Chat response did not contain choices[0].message.content."
    exit 8
}

Write-Output "CHAT_STATUS=200"
if (-not $actual.Contains($Sentinel)) {
    Write-Error "Chat response did not contain the expected sentinel."
    exit 9
}

Write-Output "SENTINEL_MATCH=True"
Write-Output "SMOKE_TEST_OK"
exit 0