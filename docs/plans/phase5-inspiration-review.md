# Phase 5 inspiration review

Status: complete as of 2026-11-08. This was a static, read-only review. No live Microsoft 365 request was made, port 4142 was not opened, dependencies were not installed, and no GitHub interaction modified an upstream project.

## Scope and method

The review covers the Phase 5 watch-list in `docs/plans/hermes-integration.md`. Evidence came from GitHub repository metadata, pull-request metadata and file lists, and shallow clones that were removed after inspection. Conclusions describe observable design ideas, not production validation.

The criteria are:

- licence
- upstream protocol
- authentication
- streaming
- tool calling, including format and parallel-call behaviour
- give-up and recovery handling
- usage and token reporting
- retries and HTTP 429 behaviour
- Windows behaviour

“Not observed” means the reviewed tree did not provide clear evidence. It does not prove that the capability is absent.

## Executive result

The most valuable ideas are:

1. **Add a Windows-native acceptance and lifecycle kit.** Upstream PR #46 supplies a useful decomposition into setup, start, smoke test, stop, and Scheduled Task installation. The current tree has Windows-specific command-length protection, but no equivalent operational acceptance kit.
2. **Validate generated tool arguments against the declared schema before forwarding them.** PR #90 and M365Bridge both treat type preservation and schema validation as an API boundary. The current fenced parser preserves and parses several value types, but the downstream contract would be safer with explicit schema validation and rejection details.
3. **Persist privacy-safe reliability and quota observations.** PR #90 separates request metadata, model reliability, quota observations, and content. The current proxy exposes per-response diagnostics but has no durable, queryable reliability history.

These priorities are independent of adopting another transport. The present Sydney/Chathub path remains the most directly comparable transport; AugLoop and Substrate implementations are useful mainly as independent protocol and recovery references.

## Project reviews

### Upstream PR #46: Windows-native proxy setup and smoke tests

Source: <https://github.com/cramt/m365-copilot-proxy/pull/46>

| Criterion | Finding |
|---|---|
| Licence | MIT through the upstream repository. |
| Protocol | Inherits the upstream Sydney/Chathub implementation; this PR is operational rather than a protocol change. |
| Authentication | Reuses the existing automated browser/MSAL setup. The setup script also installs the matching Playwright Chromium runtime. |
| Streaming | Smoke testing covers the normal proxy API; no new stream algorithm is introduced. |
| Tool calling | The test script exercises a real client tool loop with a unique file sentinel. |
| Give-up/recovery | No new model give-up logic. Operational checks fail visibly and preserve a separate running instance. |
| Usage/token | No new accounting. |
| Retry/429 | No new retry policy. |
| Windows | The central contribution: separate PowerShell setup, start, test, stop, and Scheduled Task scripts; loopback listener checks; process ownership; native path handling; and an end-to-end acceptance guide. |
| Disposition | Closed, not merged. The PR description records native Windows validation, but this review did not repeat it. |

### Upstream PR #90: operations, managed runtime, and tool-call reliability

Source: <https://github.com/cramt/m365-copilot-proxy/pull/90>

| Criterion | Finding |
|---|---|
| Licence | MIT through the upstream repository. |
| Protocol | Extends the existing Sydney/Chathub implementation and keeps the same OpenAI-compatible boundary. |
| Authentication | Adds optional named application keys, hashed storage, administrator-password sessions, and stricter management-origin checks. |
| Streaming | Fixes leading-character duplication by assembling from the addressed card text. Adds explicit streaming error and cancellation coverage. |
| Tool calling | Preserves boolean, numeric, array, object, and inline-object argument types; rejects malformed JSON; adds contract probes for JSON and SSE responses. |
| Give-up/recovery | Adds durable error grouping and model reliability observations rather than a new confabulation algorithm. |
| Usage/token | Persists privacy-limited activity, timing, requested/served model, quota, fallback, and reliability observations while excluding normal chat content. |
| Retry/429 | Tracks throttling and failure trends; supports opt-in sustained-throttling alerts and model-scoped rules. |
| Windows | Adds portable bundled runtimes, supervised sign-in startup, draining restarts, release verification, staged updates, rollback, and Windows CI. |
| Disposition | Closed, not merged. It is a very large draft and is best treated as a catalogue of separable ideas, not an adoption unit. |

### AlenPelin/m365-copilot-proxy

Source: <https://github.com/AlenPelin/m365-copilot-proxy>

| Criterion | Finding |
|---|---|
| Licence | MIT. |
| Protocol | Sydney/Chathub, because it is a fork of `cramt/m365-copilot-proxy`. |
| Authentication | Same browser/MSAL and recovery lineage as upstream. |
| Streaming | Same OpenAI-compatible SSE implementation and streaming tests as its upstream lineage. |
| Tool calling | Prompt-emulated fenced tool calls; the fork contains the upstream PR #70/#71/#78 line of work for relay framing, fence parsing, and give-up patterns. |
| Give-up/recovery | Explicit anti-confabulation and recovery logic inherited from or developed alongside the current integration line. |
| Usage/token | Exposes M365 diagnostics rather than authoritative token counts. |
| Retry/429 | Same empty-response, priority-budget, and throttle handling lineage as the current project. |
| Windows | Contains the same Windows command-length protections and related tests as the current integration lineage. |
| Disposition | Useful as a comparison point, but it does not present a clearly independent missing idea. Avoid circularly attributing our own upstream work as external inspiration. |

### kuchris/m365-copilot-openai-proxy

Source: <https://github.com/kuchris/m365-copilot-openai-proxy>

| Criterion | Finding |
|---|---|
| Licence | Apache-2.0. |
| Protocol | Microsoft Substrate/Graph-oriented client rather than the browser Sydney/Chathub path. |
| Authentication | Persisted token store and documented refresh workflow. |
| Streaming | OpenAI-compatible response layer is present, but the small reviewed tree did not show evidence comparable to the current live-delta implementation. |
| Tool calling | No clear user-defined parallel tool-call implementation was observed. |
| Give-up/recovery | Session persistence is present; no explicit model give-up detector was observed. |
| Usage/token | No authoritative token-accounting design was observed. |
| Retry/429 | No distinctive 429 strategy was observed in the reviewed files. |
| Windows | Python implementation is portable in principle; no Windows-native lifecycle kit was observed. |
| Disposition | The alternative Substrate session and token-store boundary is useful as a conceptual comparison. Apache-2.0 is compatible with an MIT project when notices and attribution are preserved, but no code copying is proposed. |

### MurasameCyan/Ciallo-Ms-365-OpenAI-Proxy-Docker

Source: <https://github.com/MurasameCyan/Ciallo-Ms-365-OpenAI-Proxy-Docker>

| Criterion | Finding |
|---|---|
| Licence | Apache-2.0. |
| Protocol | Substrate/Graph and consumer-cloud variants, with separate cloud and personal-session clients. |
| Authentication | Multiple token identities, refresh-token flow, admin authentication, cookie-assisted token acquisition, and session routing. |
| Streaming | Dedicated SSE, stream-guard, reasoning-stream, repeated-delta, close, and upstream-error tests. |
| Tool calling | Separate parser, hygiene, and router layers; OpenAI, Anthropic, and Responses compatibility tests; tool-choice and ordering tests. |
| Give-up/recovery | Session auto-heal and stream guards are explicit, although no prose-confabulation pattern set like ours was observed. |
| Usage/token | Dedicated usage store. |
| Retry/429 | Distinguishes non-stream rate-limit errors and streaming upstream failures; includes citation retry attribution. |
| Windows | Docker is the primary deployment story. It is usable on Windows through Docker Desktop but is not a native Windows lifecycle design. |
| Disposition | Strong test-architecture inspiration, especially separating stream guarding, tool hygiene, routing, and upstream-error translation. |

### HEXUXIU/M365-Copilot2API

Source: <https://github.com/HEXUXIU/M365-Copilot2API>

| Criterion | Finding |
|---|---|
| Licence | GitHub reports `NOASSERTION`; a file named `LICENSE` exists, but compatibility was not established in this review. Treat implementation code as unavailable for reuse unless the licence is clarified. Ideas may still be studied. |
| Protocol | Sydney/Chathub-style transport with connection pooling, events, snapshots, tool protocol, and HAR-derived protocol notes. |
| Authentication | Device-code and PKCE flows with token caching. |
| Streaming | Dedicated stream-event handling, snapshot reconciliation, timeout classification, finalization tests, legacy-stream fallback, and structured stream errors. |
| Tool calling | Native, fenced, XML, and model-specific routes; tool-loop state, progress, validation, tool limits, and additional Responses tools. |
| Give-up/recovery | Snapshot reconciliation and fallback paths address transport divergence; no direct equivalent of our prose give-up detector was established. |
| Usage/token | Dedicated usage HTTP layer and Codex usage mapping. |
| Retry/429 | Structured upstream errors and timeout classification are present; exact retry limits were not established from this static pass. |
| Windows | Contains Windows autostart support. |
| Disposition | High-value architecture reference, especially snapshot reconciliation and tool-state separation. Licence uncertainty means idea-only treatment. |

### faprikaa/augloop-copilot-proxy

Source: <https://github.com/faprikaa/augloop-copilot-proxy>

| Criterion | Finding |
|---|---|
| Licence | MIT. Fork of `suimi8/augloop-copilot-proxy`. |
| Protocol | AugLoop HTTP and WebSocket transport aimed at Excel Copilot, not Sydney/Chathub. |
| Authentication | Token manager supports cached AugLoop tokens and Windows-specific acquisition paths. |
| Streaming | WebSocket input is adapted to OpenAI-compatible SSE. |
| Tool calling | Prompt-parsed tool calls with an orchestrator and registry. Responses expose standard `tool_calls`; advertised Responses output marks parallel tool calls false. |
| Give-up/recovery | Includes an explicit Windows-grounding retry when the model claims it cannot use the local machine. |
| Usage/token | Estimates tokens locally and supports `stream_options.include_usage`; values are estimates, not Microsoft metering. |
| Retry/429 | README states that request rate limiting is not implemented. |
| Windows | Windows-only token acquisition includes process-memory scanning and Office integration. This is operationally and security-wise unsuitable for transfer into the current browser-auth design. |
| Disposition | Useful evidence that local estimated usage can satisfy client schemas, but the estimate must be labelled clearly. Do not transfer memory-scanning or token-extraction techniques. |

### suimi8/augloop-copilot-proxy

Source: <https://github.com/suimi8/augloop-copilot-proxy>

| Criterion | Finding |
|---|---|
| Licence | MIT. |
| Protocol | AugLoop HTTP and WebSocket transport for Excel Copilot. |
| Authentication | Cached JWE/JWT token handling with Windows-dependent acquisition. |
| Streaming | Converts AugLoop WebSocket output to OpenAI-compatible SSE. |
| Tool calling | Prompt parsing plus a local tool registry; serial execution is the documented/default shape. |
| Give-up/recovery | Windows-grounding prompts and token refresh paths are present; no general confabulation classifier comparable to ours was observed. |
| Usage/token | Local token estimation and final usage chunks. |
| Retry/429 | No rate limiter is advertised. |
| Windows | Explicitly Windows-only for memory scanning and COM-assisted acquisition. |
| Disposition | Same conceptual opportunities as the fork, with less evidence of independent changes. Use only protocol-independent ideas such as carefully labelled token estimates. |

### KilimcininKorOglu/M365Bridge

Source: <https://github.com/KilimcininKorOglu/M365Bridge>

| Criterion | Finding |
|---|---|
| Licence | **No licence file and no GitHub licence declaration.** Code reuse is not permitted by default. Ideas only. |
| Protocol | Sydney scope and M365 web APIs, with OpenAI, Anthropic, Responses, and MCP surfaces. |
| Authentication | Device code and PKCE; encrypted token/cookie storage; serialized redemption of rotating refresh tokens; SSO-cookie fallback; refresh-token verification before committing setup state. |
| Streaming | Native SSE with keepalive, stream-text, stream-usage, snapshot/delta, and repeated-output tests. |
| Tool calling | Simulated calls with schema validation, duplicate-call pruning, OpenAI/Anthropic formatting, custom-tool event types, and explicit parallel-disable semantics. |
| Give-up/recovery | Current changelog says earlier fenced anti-confabulation logic was removed. Recovery concentrates on auth, snapshots, and settled-call ledgers. |
| Usage/token | Quota endpoint and conversation/daily/weekly allowance telemetry; OpenAI usage objects. |
| Retry/429 | Distinct `rate_limit_exceeded` and `upstream_throttled` errors with `Retry-After`; client throttling tests. |
| Windows | Published Windows binary and Windows-specific process implementation. |
| Disposition | Rich idea source, but strictly idea-only because no licence was found. The refresh-token concurrency design is already substantially mirrored by our auth single-flight, so it is not a top missing item. |

## Transferable ideas not currently present

| Priority | Concrete idea | Source file or URL | Corresponding file here | Expected benefit | Main risk | Licence compatibility |
|---|---|---|---|---|---|---|
| **1** | Build a Windows acceptance kit with separate setup, start, loopback/listener verification, real API smoke test, stop, and Scheduled Task installation steps. Keep each script independently usable and make the smoke test prove a client-visible tool loop with a unique sentinel. | PR #46: `scripts/windows/Setup-Proxy.ps1`, `Start-Proxy.ps1`, `Test-Proxy.ps1`, `Stop-Proxy.ps1`, `Install-ScheduledTask.ps1`; <https://github.com/cramt/m365-copilot-proxy/pull/46> | New `scripts/windows/`; existing `packages/proxy/routes/health.get.ts`; document beside `docs/windows-proxy.md` if adopted | Reproducible native-Windows installs, fewer manual production steps, and a bounded regression check before replacing the running service | Scripts can stop or test the wrong process unless ownership and port checks are strict; live smoke tests consume M365 capacity and must remain explicit | MIT to MIT. Direct adaptation is legally compatible with attribution, but a clean implementation is still preferred |
| **2** | Add an explicit schema-validation boundary after fenced argument parsing and before returning `tool_calls`. Preserve JSON scalar/container types and reject malformed or contract-invalid arguments with a model-correctable diagnostic. | PR #90 `packages/core/src/fenced.ts`; M365Bridge `docs/tool-calling.md` and `pkg/toolcalling/grammarbody.go`; <https://github.com/cramt/m365-copilot-proxy/pull/90> | `packages/core/src/fenced.ts`, `packages/core/src/tools.ts`, `packages/proxy-lib/src/handler.ts` | Prevents silent string coercion and malformed arguments from reaching local tools; produces deterministic failures and stronger OpenAI/Anthropic compatibility | Full JSON Schema support can become large and slow; validation errors may expose schema details or trigger retry loops. Start with the subset already represented by `ToolDef` | PR #90 is MIT-compatible. M365Bridge has no licence, so use only its public design idea, not its code |
| **3** | Persist privacy-safe model reliability, throttling, fallback, and quota observations without storing normal prompt or response content. Provide bounded summaries rather than a full dashboard first. | PR #90 `packages/proxy-lib/src/usage-observations.ts`, `model-reliability.ts`, and `activity-schema.ts`; <https://github.com/cramt/m365-copilot-proxy/pull/90> | `packages/proxy-lib/src/handler.ts`, `packages/core/src/log.ts`, and a small new observations module if approved | Turns anecdotal model behaviour into trend data, supports capacity decisions, and makes 429/fallback regressions visible | Metadata can still become sensitive; unbounded retention and high-cardinality labels create privacy and storage problems | MIT to MIT; compatible. Reimplement the minimal data model rather than importing the operations subsystem |
| 4 | Add snapshot-versus-delta reconciliation tests that model an initial preview overlapping the first delta and other repeated-prefix cases. | HEXUXIU `internal/chathub/snapshot_reconciler.go` and `_test.go`; MurasameCyan `tests/test_stream_preserves_repeated_deltas.py` | `packages/core/src/session.ts`, `packages/proxy-lib/src/streaming.test.ts`, and the prefix/tail path in `packages/proxy-lib/src/handler.ts` | Guards against leading-token duplication, missing text, and divergence between live deltas and the final snapshot | Transport semantics differ; an over-aggressive deduplicator can delete legitimate repeated text | HEXUXIU is licence-uncertain, idea only. MurasameCyan is Apache-2.0, compatible with notice obligations |
| 5 | Separate stream guarding, tool hygiene, and tool routing into independently testable boundaries instead of growing one handler path. | MurasameCyan `sse_stream.py`, `stream_guard.py`, `tool_hygiene.py`, `tool_router.py` and their tests | `packages/proxy-lib/src/handler.ts`, `packages/core/src/fenced.ts` | Smaller failure domains and clearer tests for stream errors, tool order, duplicates, and client-specific formatting | Premature extraction can add indirection without reducing complexity; do it only when a concrete change touches the boundary | Apache-2.0 is compatible when attribution and notice requirements are met; design-level reimplementation avoids copying |
| 6 | Offer optional, explicitly labelled estimated token counts for clients that require non-zero OpenAI usage, while retaining M365 quota diagnostics as separate fields. | suimi8/faprikaa `server.py` usage and `stream_options.include_usage` paths | `packages/proxy-lib/src/handler.ts` `buildUsage()` | Better compatibility with clients that budget or display tokens even when Microsoft provides no counts | Estimates may be mistaken for billing truth. Tokenizer mismatch across Claude/GPT models can be large | MIT-compatible. Implement independently and label values as estimates |
| 7 | Verify a newly supplied refresh token by redeeming it before replacing durable auth state, and keep concurrent redemption single-flight. | M365Bridge `pkg/auth/auth.go`, `pkg/auth/auth_test.go`, and changelog notes | `packages/core/src/auth.ts`, `packages/core/src/auth-recovery.ts` | Avoids persisting placeholder, stale, or already-consumed refresh tokens; protects rotating tokens during concurrent starts | Redemption may rotate or consume a token, so persistence must be atomic and tested under failure | No licence found. Idea only. The current implementation already has single-flight refresh, so only the verify-before-commit gap is relevant |
| 8 | Classify streaming failures in-band after HTTP 200 is committed, and preserve a machine-readable retry class and retry-after value. | MurasameCyan `tests/test_anthropic_stream_errors.py`, `tests/test_openai_stream_upstream_error.py`; M365Bridge `docs/api.md` | `packages/proxy-lib/src/handler.ts` streaming error chunk | More reliable client backoff and fewer ambiguous partial responses | Clients differ in non-standard error-chunk handling; compatibility tests are required | Apache-2.0 source is compatible with notices. M365Bridge remains idea-only |
| 9 | Maintain a transport-agnostic auth/session interface so Sydney, Substrate, or another upstream can be investigated without changing the API and tool layers. | kuchris `session_store.py`, `substrate_client.py`, `token_store.py`; MurasameCyan cloud/session clients | `packages/core/src/session.ts`, `packages/proxy-lib/src/handler.ts` | Makes future protocol experiments bounded and reduces coupling between authentication, transport, and OpenAI rendering | An abstraction without a second supported transport can become speculative and obscure Sydney-specific behaviour | Apache-2.0 is compatible with notices; adopt the boundary only when a second transport experiment is authorized |
| 10 | Add Windows autostart health semantics that distinguish process liveness, readiness, and restart/rollback safety. | HEXUXIU `internal/web/autostart_windows.go`; PR #90 supervised runtime and Windows task files | `packages/proxy/routes/health.get.ts`; future `scripts/windows/` | Safer startup and recovery after crashes or updates | Restart loops can amplify auth failures or damage the known-good installation | PR #90 is MIT-compatible. HEXUXIU remains idea-only due to unclear licence |

## Ideas deliberately not recommended

- **Windows process-memory token scanning and COM automation from the AugLoop projects.** These mechanisms are transport-specific, increase credential exposure, and do not fit the current browser/MSAL authentication boundary.
- **Copying any M365Bridge implementation.** No licence was found, so only independently derived ideas are usable.
- **Adopting PR #90 as one unit.** Dashboard, alerting, backups, updates, authentication, and protocol fixes have different risk profiles. Pulling the whole subsystem would obscure the small transferable wins.
- **Replacing the Sydney/Chathub transport solely because another project uses AugLoop or Substrate.** The reviewed projects do not establish that those transports improve the current Claude tool loop, and several add narrower tenant, Excel, Docker, or Windows assumptions.
- **Treating estimated token counts as Microsoft usage.** If estimates are added, the API must distinguish them from upstream quota and metering observations.

## Recommended sequence

1. Implement the Windows lifecycle and acceptance scripts as a focused, reviewable task, with no production replacement in the same change.
2. Add failing-before parser tests for typed and invalid tool arguments, then implement only the schema subset required by existing `ToolDef`.
3. Define a minimal privacy model for reliability observations, including retention, allowed fields, and cardinality limits, before introducing persistence.
4. Add stream-overlap regression tests regardless of whether the snapshot reconciliation implementation changes.
5. Revisit transport abstraction only when a concrete second-transport experiment is authorized.