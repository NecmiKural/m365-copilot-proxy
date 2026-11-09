Set-StrictMode -Version Latest

function Assert-SafePort {
    param([Parameter(Mandatory)][int]$Port)

    if ($Port -lt 1024 -or $Port -gt 65535) {
        throw "Port must be between 1024 and 65535."
    }
}

function Get-PortListeners {
    param([Parameter(Mandatory)][int]$Port)

    @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-ProcessDetails {
    param([Parameter(Mandatory)][int]$ProcessId)

    Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
}

function Test-LoopbackAddress {
    param([Parameter(Mandatory)][string]$Address)

    $Address -in @("127.0.0.1", "::1")
}

function Resolve-FullPath {
    param([Parameter(Mandatory)][string]$Path)

    [System.IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path))
}

function Invoke-JsonRequest {
    param(
        [Parameter(Mandatory)][ValidateSet("GET", "POST")][string]$Method,
        [Parameter(Mandatory)][uri]$Uri,
        [hashtable]$Headers = @{},
        [string]$Body,
        [int]$TimeoutSec = 30
    )

    $parameters = @{
        UseBasicParsing = $true
        Method          = $Method
        Uri             = $Uri
        Headers         = $Headers
        TimeoutSec      = $TimeoutSec
        ErrorAction     = "Stop"
    }
    if ($PSBoundParameters.ContainsKey("Body")) {
        $parameters.ContentType = "application/json"
        $parameters.Body = $Body
    }

    Invoke-WebRequest @parameters
}

function Test-M365ProxyCommandLine {
    param([AllowNull()][string]$CommandLine)

    if ([string]::IsNullOrWhiteSpace($CommandLine)) {
        return $false
    }

    $CommandLine -match "(?i)(^|[\\/`"'\s])m365-proxy\.mjs(?:[`"'\s]|$)"
}

function Assert-ProductionPortUntouched {
    param([Parameter(Mandatory)][int]$Port)

    if ($Port -eq 4141) {
        throw "Port 4141 is reserved for production and is not accepted by the Windows acceptance scripts."
    }
}