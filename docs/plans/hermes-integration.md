# Hermes and M365 Proxy Integration Plan

Source: the original integration prompt, the Hermes roadmap, and the Phase 1
evidence captured on 4 November 2026.

## Decisions

1. Commits and pushes are permitted only on `dev/integration` (see 6;
   `feat/hermes-agent-integration` is preserved unchanged). Do not open a pull
   request or merge, and do not modify `daily`, `main`, or production port 4141.
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
7. Deploy rule (user decision, 2026-11-08): when work on `dev/integration` is
   verified green (unit tests, typecheck, and the relevant live tests show no
   regression), merge `upstream/main` directly into `daily` if it has new
   commits, then merge `dev/integration` into `daily`, build, test, push, and
   restart production 4141 at any time. Open upstream PR branches (#70, #71,
   #78) are left untouched. Create a `daily-backup-<date>` tag first for
   rollback. The supervisor performs the restart (the worker agent itself runs
   on 4141).

## Goal

Use pi and OpenClaw (and Hermes) through this proxy as full general-purpose
agents on the Windows work machine: repository discovery, writing and fixing
code, using skills, data analysis, and producing Word/PDF documents. The main
problem to eliminate is the model giving up ("I can't", "my tools are
disabled") or emitting tool calls as plain text. Find these failures in the
debug logs, form a hypothesis, test it, and record it in `docs/hypotheses.md`.

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
| Phase 2c: test G A/B (pre-`67e8f6a` vs HEAD), F1 fix, F2 design note | COMPLETE | Four G runs were nondeterministic: baseline `b56440cb` 1/2 PASS, HEAD `d42a591c` 0/2 PASS (`runtime/reports/phase2c-ab-summary.txt`). F1 exact `<command>...</command>` unwrapping is GREEN in `873f1de`; build and core/proxy-lib TypeScript checks pass, with only the two known upstream Windows Vitest failures. F2 design: `docs/plans/phase2c-f2-parallel-design.md`. Port 4142 is closed. |
| Plan completeness fix | COMPLETE | This commit: watch-list links, Phase 2b, final report format, working rules, goal, Decision 1 |
| Give-up root-cause offline analysis | COMPLETE | `docs/hypotheses.md` H45; first-turn full-prompt and follow-up delta paths compared with successful runs; no live test or code fix |
| F1 adjacent command-wrapper edge case | COMPLETE | Adjacent `<command>a</command>` and `<command>b</command>` elements remain unchanged; focused test, build, core/proxy-lib TypeScript pass; only two known Windows Vitest failures |
| Phase 2d, H45 full-history recovery live G | FAIL, recovery not exercised | Pushed build `49bc1235` ran G twice with valid `--in`: 0/2 PASS, terminal calls 2 and 0, give-up 2/2, full-contract resend 0/2. External evidence: `C:/Users/NecmiKural/projects/hermes-m365-development/runtime/reports/phase2d-g-summary.txt`. Port 4142 is closed. |
| Phase 3, real token usage inventory | COMPLETE, no code change | Offline inspection found no real upstream input/output/total token field. Observed values are message counts, turn counts, classifier/routing metadata, priority-access turn allowances, or timestamps. OpenAI usage remains unchanged; no 4142 live request was warranted. H48: `docs/hypotheses.md`; external evidence: `runtime/reports/phase3-upstream-usage-inventory.txt`; analysis commit `0d2559d`. |
| Deploy 2026-11-08 (2) | COMPLETE | Phase 2g green (G 2/2, C 1/1, recovery 4x, no probe call, no fence leak); `upstream/main` had no new commits; `daily` merged `dev/integration` at `467b0cc` as `816bccc` and was pushed; backup tag `daily-backup-20261108b`; build and typecheck green, Vitest 470 passed with only the 2 known Windows failures; 4141 restarted (PID 14384 -> 26156), `/health` 200, live chat `DEPLOY2_OK`. Evidence: external `runtime/reports/deploy-20261108b-*`. |
| Deploy 2026-11-08 | COMPLETE | `upstream/main` had no new commits; `daily` merged `dev/integration` at `866039f` as `a3ed0ba` and was pushed; backup tag `daily-backup-20261108`; build, typecheck green, Vitest 467 passed with only the 2 known Windows failures; 4141 restarted (PID 16996 -> 14384), `/health` 200, live chat returned `DEPLOY_OK`. Evidence: external `runtime/reports/deploy-20261108-*`. |
| Phase 2e, give-up detector and H45 live recovery | COMPLETE, mixed live result | Detector fix `c9114be` is GREEN. On the pushed build, G ran twice with valid `--in`: 1/2 PASS, 8 and 2 terminal calls, give-up 2/2, detector/full-contract resend 2/2, and model continuation after resend 2/2. C passed 1/1 with two terminal calls and no recovery. Absolute debug ranges: G1 `9776-11421`, G2 `11422-12054`, C `12055-12479`. External evidence: `C:/Users/NecmiKural/projects/hermes-m365-development/runtime/reports/phase2e-summary.txt`. Port 4142 is closed; production 4141 remained healthy on PID 16996. |
| Phase 2f, G2 recovery-history analysis | COMPLETE | H46 shows one real pre-step inspection probe was preserved by full-history recovery; step 1 was not duplicated. Analysis only, no live test. |
| Phase 2b step 1, terminal rejection classification | COMPLETE | 46 terminal executions inspected across isolated and production logs: wrapper leak 1, adjacent-fence leakage 2, missing field 0, wrong type 0, PowerShell-in-POSIX 0, extra field 0. Report: `docs/plans/phase2b-terminal-argument-classification.md`; no live test. |

## Invariants

- Production checkout: `m365-proxy-daily`, branch `daily`, commit
  `816bccc` (second deploy 2026-11-08; rollback tags `daily-backup-20261108b` =
  `a3ed0ba` and `daily-backup-20261108` = `d4af8e34`), clean.
- Production port 4141 runs PID `26156` (since the second 2026-11-08 deploy; it
  changes on every restart, so read the current LISTENING PID and record it
  before a run) and returns HTTP 200.
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
- Production 4141 also serves pi, OpenClaw, the user's Hermes (including its
  Telegram gateway) and alook; never restart or reconfigure it. Never run
  `pnpm dev` on 4141.
- Health gate before and after every mutation: 4141 LISTENING PID equals the
  recorded PID, `GET http://127.0.0.1:4141/health` returns 200, and `daily` is
  clean at the recorded commit.
- Process IDs: Git Bash `$!` is not the Windows PID. Write the `netstat`
  LISTENING PID of `127.0.0.1:4142` to the PID file and stop only on PID-file
  equals listener PID.
- A live test may start only after `debug-4142.log` is shown to grow (for
  example after a `/health` request) and the isolated Hermes `base_url` is shown
  to be `http://127.0.0.1:4142/v1`. Always pass a valid `--in` directory.
- Classify harness, logging, or environment faults as INVALID RUN, never as
  FAIL.
- Run only one live M365 measurement at a time. The work account throttles
  after roughly 100-200 messages per hour (about 70 minutes); schedule heavy
  runs outside working hours and tell the user. Check processes and ports, not
  log freshness, before starting.
- Ask the user before opening a pull request, commenting on a PR or issue, or
  requesting a review.
- Never show API keys or tokens in reports.
- Do not link `node_modules` into a temporary worktree via a junction; install
  there with `pnpm install --frozen-lockfile` instead.
- Do not write to the user's databases and do not close open Office
  applications.
- Code, commits, PR text and documentation are in English; reports to the user
  are in Turkish.

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

Contract items from the original prompt to record with evidence in the final
report: `POST /v1/chat/completions`, streaming/SSE, `tools` and `tool_choice`,
`assistant.tool_calls`, `role=tool` with `tool_call_id`, the `developer` role,
and `stream_options`.

### Final report format

Every phase-closing report uses the original format: Hermes version/commit,
proxy version/commit, base URL, model, Hermes provider config (no secrets);
PASS/FAIL for plain chat, single tool call, multi-step tool loop, error
recovery, typed arguments (PASS/FAIL/NOT APPLICABLE), streaming, long chain,
and parallel tool calls (PASS/FAIL/NOT TESTED); the first failing
request/response difference; relevant log lines; root cause; a Hermes
reliability verdict given separately for chat only, simple agent tasks, and
long coding-agent tasks; and the smallest proposed fix.

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

### Phase 2b: Terminal argument rejection

The most valuable reliability fix. Start from F1 (`<command>...</command>`
wrapper leak, debug line 3006) in `docs/hypotheses.md`.

1. Collect rejected or malformed terminal calls from the debug logs (the
   production 4141 log may be read, never written) and classify them: missing
   field, wrong type, wrapper leak, PowerShell syntax on a POSIX shell, extra
   field.
2. RED tests, then the minimum proxy fix: argument normalisation that keeps
   required fields and respects `additionalProperties: false`; on a validation
   error, return the error to the model once and allow one correction attempt,
   behind a kill-switch environment variable (in the style of
   `M365_NO_FENCE_RETRY`).
3. Isolated Hermes configuration only (no Hermes source change): state in the
   terminal tool guidance that the host is Windows with a POSIX Git Bash shell
   and PowerShell syntax must not be used.
4. Re-run the Phase 1 matrix on isolated 4142 and compare the rejection rate
   before and after.

### Phase 3: Token usage telemetry

Inspect documented and captured upstream frames for real usage fields. Map only
real upstream values to OpenAI usage, including the final streaming usage
chunk. Do not estimate standard or extension fields.

**Decision (2026-11-08): real usage unavailable upstream.** The inspected
documentation and `debug-4142.log` expose messages, turn counts, classifier
scores, content origin, message-quota counters, optional priority-access turn
allowances, and telemetry timestamps, but no real input/output/total token
count. Therefore no code or live 4142 test is added, and the existing OpenAI
usage values remain unchanged. See `docs/hypotheses.md` H48 and external
`runtime/reports/phase3-upstream-usage-inventory.txt`.

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
- https://github.com/cramt/m365-copilot-proxy/pull/46
- https://github.com/cramt/m365-copilot-proxy/pull/90
- https://github.com/kuchris/m365-copilot-openai-proxy
- https://github.com/MurasameCyan/Ciallo-Ms-365-OpenAI-Proxy-Docker
- https://github.com/HEXUXIU/M365-Copilot2API
- https://github.com/faprikaa/augloop-copilot-proxy
- https://github.com/suimi8/augloop-copilot-proxy
- https://github.com/KilimcininKorOglu/M365Bridge

Output: a table of concrete ideas that can feed Phases 2b-4.

### Phase 6: Maintenance candidates

Authorised work on `dev/integration`; each item is confirmed with the user
before starting:

- Fix the two upstream tests that fail on Windows because of POSIX path
  assumptions: `log.test.ts` and `scripts/bench/turn-budget.test.mjs`.
- Windows phase-sweep adaptations (`owns_port`, a port check instead of
  `kill -0`, stopping via `Get-NetTCPConnection`).
- Restart-on-crash for the autostart scheduled task (today the proxy does not
  come back after a crash).
- Watch the open upstream PRs #70 (gpt56-relay), #71 (fence-parsing) and #78
  (giveup-patterns): fix and draft replies for new reviews (shown to the user
  first), and apply the upstream merge routine when upstream/main moves
  (`git merge --no-ff --no-commit upstream/main`, no rebase or force push;
  upstream sections first in `hypotheses.md`, ours renumbered after). If an upstream pull
request is later warranted, create its focused topic branch by cherry-picking
the relevant commits from `dev/integration`; do not develop it separately in
advance.
