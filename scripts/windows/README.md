# Windows acceptance and lifecycle scripts

These PowerShell scripts provide independent Windows steps for an isolated
M365 Copilot proxy. They are a clean implementation of the operational idea
recorded in `docs/plans/phase5-inspiration-review.md`; no external code was
copied.

## Safety defaults

- `-Port` is mandatory.
- Port `4141` is rejected because it is reserved for production.
- `start.ps1` binds to `127.0.0.1` by default.
- `stop.ps1` stops only the process listening on the requested port, and only
  when its command line contains `m365-proxy.mjs`.
- `install-tasks.ps1` only prints its plan unless `-Apply` is explicitly given.
- API keys are read from `M365_API_KEY` by default and are never printed.

The default configuration directory is a temporary acceptance directory, not
the production configuration directory.

## Acceptance sequence

Run from the repository root in Windows PowerShell:

```powershell
$cfg = Join-Path $env:TEMP "m365-proxy-phase12"
$repo = (Resolve-Path ".").Path

.\scripts\windows\start.ps1 -Port 4142 -ConfigDir $cfg -RepoDir $repo
.\scripts\windows\verify-listener.ps1 -Port 4142 -ConfigDir $cfg -RepoDir $repo
.\scripts\windows\smoke-test.ps1 -Port 4142 -ConfigDir $cfg -RepoDir $repo `
  -Sentinel "PHASE12_SMOKE_OK"
.\scripts\windows\stop.ps1 -Port 4142 -ConfigDir $cfg -RepoDir $repo
.\scripts\windows\verify-listener.ps1 -Port 4142 -ConfigDir $cfg -RepoDir $repo
```

The final verification is expected to exit `2`, proving that the port is
closed.

Preview Scheduled Task definitions without changing files or tasks:

```powershell
.\scripts\windows\install-tasks.ps1 -Port 4142 -ConfigDir $cfg -RepoDir $repo
```

Only an intentional installation should add `-Apply`. Do not run `-Apply`
against the production task names or production port.

## Offline self-checks

Each public script has a non-mutating self-check:

```powershell
.\scripts\windows\start.ps1 -Port 4142 -SelfTest
.\scripts\windows\verify-listener.ps1 -Port 4142 -SelfTest
.\scripts\windows\smoke-test.ps1 -Port 4142 -SelfTest
.\scripts\windows\stop.ps1 -Port 4142 -SelfTest
.\scripts\windows\install-tasks.ps1 -Port 4142 -SelfTest
```

Exit codes from `verify-listener.ps1` are: `0` healthy loopback listener,
`2` no listener, `3` wildcard or non-loopback listener, `4` health request
failure, and `5` non-200 health status. `smoke-test.ps1` returns nonzero for
models, chat, JSON, or missing-sentinel failures.
