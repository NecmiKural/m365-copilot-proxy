# Hermes and M365 Proxy Integration Plan

Source: the original integration prompt, the Hermes roadmap, and the Phase 1
evidence captured on 4 November 2026.

## Decisions

1. Commits and pushes are permitted only on `feat/hermes-agent-integration`.
   Do not open a pull request or merge, and do not modify `daily`, `main`, or
   production port 4141.
2. Token usage must contain only real upstream values. Estimated token usage is
   prohibited.
3. Find a viable parallel-tool-call path unless parallel execution is
   fundamentally incompatible with M365.
4. Do not modify Hermes source code. Hermes changes are limited to an isolated
   configuration and home directory.
5. Keep this plan and its status tracking in the repository and push updates.

## Status

| Phase or step | Status | Evidence or commit |
|---|---|---|
| Phase 1, tests A-D | PASS | `runtime/reports/hermes-m365-integration-summary.md` |
| Phase 1, test E typed arguments | PASS | Phase 1 integration evidence |
| Phase 1, test F strict streaming | PASS | `runtime/reports/test-f-evidence-20261104-202319.txt` |
| Phase 1, test G long chain | PASS | `runtime/reports/test-g-evidence-20261104-202344.txt`; `LONG_CHAIN_OK:8` |
| Phase 1, test P parallel calls | NOT TESTED | Give-up occurred before the parallel layer; `runtime/reports/test-p-evidence-20261104-202512.txt` |
| Phase 1, give-up finding | OPEN, Phase 2 candidate | `debug-4142.log` lines 2837 and 2895 |
| Phase 1, bind isolation | ENFORCED | Test port 4142 must bind only to `127.0.0.1`; wildcard listeners fail the safety gate |
| Step 0, correct test P classification | COMPLETE | Summary says NOT TESTED and records the give-up blocker |
| Step 1, add plan and status | COMPLETE | Commit containing this document |
| Phase 2a, hypothesis and RED test | PENDING | English and Turkish tool-unavailable claims |
| Phase 2a, minimum fix and GREEN verification | PENDING | Build, Vitest, and TypeScript checks |
| Phase 2a, commit and push | PENDING | Commit SHA to be recorded |
| Isolated E2E, test P retry | PENDING | One live run on loopback-only port 4142 |
| Isolated E2E, tests C and G regressions | PENDING | Run only after test P reaches the intended layer |
| Final shutdown and status update | PENDING | PID-matched shutdown evidence and final commit |

## Invariants

- Production checkout: `m365-proxy-daily`, branch `daily`, commit
  `d4af8e34d33adc3ae11ad954969e3b028b7b4cd6`, clean.
- Production port 4141 remains on PID `16996` and returns HTTP 200.
- Development checkout: `feat/hermes-agent-integration`.
- Live tests use only an isolated proxy on port 4142 and an isolated Hermes
  home/configuration.
- Port 4142 must listen only on `127.0.0.1`. A listener on `0.0.0.0` or `[::]`
  must be stopped before a live request.
- Stop at the first failure and classify the failing layer.
- Use RED, the minimum fix, then GREEN.
- Do not commit `.idea/`, `.github/copilot-instructions.md`, or
  `scripts/bench/phase-sweep-win.sh`.
- Use the user's Git identity and English commit messages. Do not add generated
  or co-author metadata.

## Phase 1: Complete the original E2E matrix

The original matrix comprises chat (A), one tool call (B), a tool loop (C),
error recovery (D), typed arguments (E), strict streaming (F), a long chain
(G), and a separate parallel probe (P).

Phase 1 results are A-G PASS. Test P is **NOT TESTED (inconclusive)**. The model
made no tool call and claimed the terminal tool was unavailable despite tools
being present. The request did not reach parsing, execution, history handling,
or the parallel-call layer, so the run says nothing about parallel support.

Strict streaming proved that the first character was not repeated, streamed
tool arguments assembled into valid JSON, finish reasons were `stop` and
`tool_calls` as appropriate, and `stream_options.include_usage` produced an
event. Standard token counts were zero; no estimated values may replace them.

The long-chain run completed eight sequential terminal calls and returned
`LONG_CHAIN_OK:8`.

## Phase 2a: Give-up detection

### Hypothesis

The English response, “I can't execute terminal commands in this session
because no terminal tool is enabled,” and the Turkish response, “Terminal aracı
bu oturumda etkin değil...”, escaped the existing give-up patterns even though
the request contained tools. Candidate causes are pattern vocabulary and
grammar coverage, language coverage, or a handler path that does not invoke the
detector in Hermes tool mode.

Record the hypothesis in `docs/hypotheses.md`, add a failing unit test covering
the two observed strings and narrow equivalent variants, confirm RED, apply the
smallest detector correction, and confirm GREEN. Avoid broad patterns that
would match documentation describing legitimately disabled tools.

Verification:

- `pnpm build`
- `npx vitest run`, accounting explicitly for only the two known upstream
  Windows failures
- `npx tsc --noEmit -p packages/core`
- `npx tsc --noEmit -p packages/proxy-lib`

Then commit and push the focused change.

## Isolated E2E verification

Start one isolated proxy on port 4142, explicitly bound to `127.0.0.1`, and
verify the actual listener address before sending any request. Use an isolated
Hermes home/configuration and do not modify Hermes source.

Retry test P with exactly two independent read-only calls. Capture:

- the request's `parallel_tool_calls` value;
- whether one assistant message contains at least two tool calls;
- whether Hermes executes both calls;
- whether both results return to history with the correct `tool_call_id`.

If the give-up is fixed but the request still does not reach parallel
execution, diagnose the precise blocking layer. Keep parallel execution
disabled by default until evidence supports enabling it.

After test P, repeat tests C and G once as regressions. Stop at the first
failure. Finally, stop port 4142 only after verifying that the PID file matches
the listener PID, record shutdown evidence, update this status table, and push.

## Later phases

### Phase 3: Token usage telemetry

Inspect documented and captured upstream frames for real usage fields. Map only
real upstream values to OpenAI usage, including the final streaming usage
chunk. Do not estimate standard or extension fields.

### Phase 4: Parallel tool calls

Determine whether the limitation is in Hermes request generation, Hermes
execution/history handling, M365 tool selection, proxy parsing, or another
layer. Pursue a compatible path unless evidence shows a fundamental M365
constraint. Use read-only tools for live probes.

### Phase 5: Contribution review

Review relevant implementations for reusable ideas, considering licence,
protocol, authentication, streaming, tools, usage, retries, and Windows
behaviour.

### Phase 6: Maintenance candidates

Track the two known Windows upstream test failures, Windows phase-sweep
adaptations, automatic restart behaviour, open contribution branches, and the
upstream merge routine as separate authorised work.
