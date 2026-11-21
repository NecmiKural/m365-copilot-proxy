# Phase 2b step 1: terminal argument rejection classification

Date: 8 November 2026  
Scope: read-only review of external isolated log
`runtime/proxy/debug-4142.log` and production log
`~/.config/opencode-m365/debug.log`. No live test was run. Secrets and
session identifiers are omitted.

## Result

The logs contain **3 malformed terminal calls** among 46 logged terminal calls
(45 isolated, 1 production). All three are in the isolated log. The production
log contains no rejected or malformed terminal call.

| Class | Count | Evidence |
|---|---:|---|
| Missing field | 0 | No logged terminal call or validation response identifies a missing required argument. |
| Wrong type | 0 | No logged terminal call or validation response identifies a scalar or container type mismatch. Typed values such as `notify: false` were parsed successfully. |
| Wrapper leak | 1 | `debug-4142.log:3006`, `Tool call: terminal {"command":"<command>\npwd\n</command>"}`; line 3009 contains `/usr/bin/bash: ... syntax error ... '<command>'`. |
| PowerShell syntax in POSIX shell | 0 | No `Write-Output`, `Get-ChildItem`, `Set-Content`, `New-Item`, `Remove-Item`, `Test-Path`, or other PowerShell-only command occurs in either inspected log. |
| Extra field | 0 | No validation response reports an unknown or additional property. |
| Other: adjacent-fence leakage | 2 | `debug-4142.log:3653`, `/usr/bin/bash: line 14: terminal: command not found ... background:: command not found ... timeout:: command not found ... workdir:: command not found`; `debug-4142.log:5957`, `/usr/bin/bash: line 13: terminal: command not found ... background:: command not found ... timeout:: command not found`. |

## Interpretation

The observed failures are command-body corruption, not JSON-schema argument
rejection. The wrapper case inserts one XML-like `<command>` element into the
body. The two “other” cases concatenate an adjacent fenced call into the first
command body, so fence metadata is executed as shell text. Neither log provides
evidence for missing-field, wrong-type, extra-field, or PowerShell-dialect
normalisation work.

Counts use one executed malformed `Tool call: terminal` event per incident.
Repeated WebSocket frames, raw-response copies, formatted tool responses, and
the model's later quotations are not counted again. Expected task failures such
as `cat` on a deliberately absent file are also excluded.

## Evidence method and limits

Every cited line number above comes from `grep -n` against the current
`debug-4142.log`, with a text fragment included. The earlier phase reports used
different absolute offsets and are not used for these citations. The production
log has only one terminal execution, at line 518:
`Tool call: terminal {"command":"ls -la\nfor file in *; ... "}`; its line 521
exit status is caused by an empty directory, not malformed arguments.

This is a log classification, not proof that unlogged malformed calls never
occurred. In particular, the logs contain no explicit tool-schema validation
failure record, so zero means “not observed in these logs.”
