# Phase 13: Reliability and quota observations

## Goal

Make production give-up, recovery, throttling, fallback, and quota behavior countable without reading debug logs. Observations are metadata only. They must never contain prompts, responses, commands, file paths, credentials, tokens, keys, tool arguments, tool results, or other request content.

## Configuration

`M365_OBSERVATIONS_FILE` enables newline-delimited JSON observations. When it is unset or empty, observations are disabled and current behavior is unchanged.

A relative value is resolved under `CONFIG_DIR`; an absolute value is used as-is. This matches `M365_LOG_FILE` resolution in `packages/core/src/log.ts`.

Before an append would exceed `M365_LOG_MAX_BYTES`, the active file is moved to one `.1` backup. No additional backups are retained. An unset or invalid limit leaves rotation disabled, matching the debug log.

## Event schema

Every line is one JSON object with these common fields:

- `ts`: ISO timestamp
- `kind`: event type
- `conversation`: short non-reversible hash of the conversation ID
- `model`: requested or active model identifier
- `stream`: whether the OpenAI-compatible request streams
- `mode`: `full` or `delta`
- `tools`: number of registered request tools

Optional fields are restricted by event kind:

- `request`
- `recovery`: `rule` is `H51`, `H52`, `H53`, or `parallel-limit`; `attempt` is the bounded retry number
- `recovery_result`: `hasToolCalls`
- `final_without_tool_after_recovery`
- `arg_validation`: `result` is `coerced`, `corrected`, or `fail_open`
- `upstream_http_error`: numeric `status`
- `throttle`: emitted only for a genuine upstream HTTP 429
- `fallback_model`
- `priority_quota`: `remaining` only when the upstream metering data supplies it

Writers construct events from an explicit allowlist. They do not accept an arbitrary metadata object, so content-bearing fields cannot be passed through accidentally.

## Instrumentation and verification

Instrumentation stays at the existing request, recovery, validation, upstream HTTP, fallback, and metering decision points. No new abstraction layer or dependency is introduced.

RED tests cover disabled output, enabled JSONL output, absence of a known secret sentinel from every event, and one-backup rotation. Summary-command tests use a small fixture.

`scripts/observations-summary.mjs [--file <path>] [--since <ISO>]` prints counts by event kind, recovery success rate based on `recovery_result.hasToolCalls`, recovery-rule distribution, genuine HTTP 429 count, and fallback count.

Acceptance requires build, full Vitest with zero failures, TypeScript checks, then isolated loopback-only port 4142 runs for G once and C once. Evidence is written outside the repository under the absolute `runtime/reports/phase13-*.txt` paths. Port 4142 is stopped afterward. Production remains unchanged; enabling production observations is deferred to deployment.
