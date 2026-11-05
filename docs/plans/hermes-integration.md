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
6. All future development, both Hermes and non-Hermes, continues on
   `dev/integration`. This branch was created from
   `feat/hermes-agent-integration`; it is based on `daily` at `d4af8e34` and
   includes `feat/hermes-compatibility` at `d270987`. Existing history and
   committer identity are not rewritten. Any committer correction is deferred
   until an upstream pull request is prepared by cherry-picking focused commits
   from this branch onto a later topic branch.

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
| Phase 2a, hypothesis and RED test | COMPLETE | Assertion-level RED: `runtime/reports/phase2a-handler-red.txt` |
| Phase 2a, minimum fix and GREEN verification | COMPLETE | Focused GREEN, build, Vitest, and TypeScript evidence under `runtime/reports/phase2a-*` |
| Phase 2a, commit and push | COMPLETE | `67e8f6a1272c33886a3124432de9f6e9087042dd` |
| Development branch migration | COMPLETE | `dev/integration` created from the pushed Phase 2a HEAD |
| Isolated E2E, test P first attempt | INVALID RUN, harness bug | `runtime/reports/test-p-phase2-stderr-20261104-213944.txt`: empty `--in`; Hermes exited 2 before any request |
| Isolated E2E, test P logging-off attempt | INVALID RUN, logging off | `runtime/reports/test-p-valid-evidence-20261105-022438.txt`: usage recorded `provider=custom` and two API calls, but the inactive debug log made the run unprovable |
| Isolated E2E, test P valid run | FAIL, Phase 2 finding | `runtime/reports/test-p-valid-evidence-20261105-025055.txt`; debug line 3006 contains one malformed terminal call and no parallel call |
| Isolated E2E, test C regression | PASS | `runtime/reports/test-c-regression-evidence-20261105-031613.txt`; two real terminal calls at absolute debug lines 3256 and 3379 |
| Isolated E2E, test G regression | FAIL, malformed adjacent fences | `runtime/reports/test-g-regression-debug-range-20261105-031613.txt`; one parsed call at absolute line 3650, then give-up at 3699 |
| Final isolated shutdown | COMPLETE | `runtime/reports/shutdown-4142-20261105-031613.txt`; PID file and listener both 18060, then listener absent and health 000 |

## Invariants

- Production checkout: `m365-proxy-daily`, branch `daily`, commit
  `d4af8e34d33adc3ae11ad954969e3b028b7b4cd6`, clean.
- Production port 4141 remains on PID `16996` and returns HTTP 200.
- Development checkout: `dev/integration`. Preserve
  `feat/hermes-agent-integration` unchanged as the branch from which it was
  created.
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

The first Phase 2 test P attempt is an **INVALID RUN**, not an upstream
give-up result. Its harness passed an empty value to `--in`; Hermes exited 2
with `argument --in: expected one argument`, sent no proxy request, and
produced an empty debug range. A valid retry must pass an explicit working
directory (or use the successful test C invocation shape) before any parallel
or give-up conclusion is drawn.

The logging-off retry at 20261105-022438 is also an **INVALID RUN**. Its
usage record shows the custom provider completed two API calls, but the
configured debug log was not active, so the proxy path and retry behaviour
cannot be proved from that run.

The valid 20261105-025055 run is **FAIL** with three Phase 2 findings:

- **F1, argument wrapper leak:** the terminal command reached the handler as
  `<command>\npwd\n</command>` at absolute debug line 3006. This is the first
  Phase 2b terminal-argument rejection case.
- **F2, single-tool-per-message claim:** the model said this runtime permits
  only one tool call per assistant message. Whether that comes from the proxy
  prompt or protocol is part of the parallel-call investigation.
- **F3, retry gap:** commit `67e8f6a1272c33886a3124432de9f6e9087042dd`
  did not classify that sentence as confabulation, so no forcing retry ran.

The independent C regression passed with two real terminal calls. G failed:
two adjacent terminal fences were emitted, the parser/execution path acted on
one malformed combined command, and the model then gave up. Port 4142 was
stopped only after PID-file/listener equality was verified.

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

Watch-list:

- https://github.com/AlenPelin/m365-copilot-proxy — fork that builds on Necmi's
  upstream PRs (#70/#71/#78); watch-list, review later.

### Phase 6: Maintenance candidates

Track the two known Windows upstream test failures, Windows phase-sweep
adaptations, automatic restart behaviour, open contributions, and the upstream
merge routine as authorised work on `dev/integration`. If an upstream pull
request is later warranted, create its focused topic branch by cherry-picking
the relevant commits from `dev/integration`; do not develop it separately in
advance.
