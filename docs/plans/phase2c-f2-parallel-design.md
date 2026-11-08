# Phase 2c F2 parallel tool-call design

## Scope

This note defines the smallest experimental path for parallel fenced tool calls.
It does not change the current serialized default and does not claim that M365,
Hermes, or the proxy supports parallel execution end to end.

The live Phase 2 findings remain the starting point:

- the shipped framing tells the model to emit exactly one fenced tool call;
- the handler reports that only the first call ran when multiple calls appear;
- the parser can already return multiple calls;
- the model's one-call limitation statement is therefore consistent with the
  current prompt and execution policy, not evidence of a fundamental M365
  limitation.

## Layered experiment

### 1. Request capability

Treat `parallel_tool_calls: true` as an explicit request-scoped capability.
Missing, false, or unsupported values retain today's serialized behavior.

The capability must not be enabled globally or inferred from model identity.
This keeps existing pi, OpenClaw, and Hermes sessions unchanged.

### 2. Parallel framing

Add a separate framing variant used only by the experimental capability. It
must:

- permit multiple fenced calls in one assistant response;
- require one complete fence per call;
- prohibit dependencies between calls in the same batch;
- state that every call receives its own result and identifier;
- retain the existing single-call wording outside this variant.

Prompt snapshot tests must prove that the default still requires one call and
the experimental variant permits a batch.

### 3. Parse and validation

Reuse `parseFencedToolCalls` rather than introduce a second parser. Validate the
entire candidate batch before execution:

- at least two calls are required to classify a response as parallel;
- every tool name must resolve to a registered definition;
- every argument object must satisfy its registered schema;
- calls must be independently executable;
- duplicate or malformed calls reject the batch before any call starts.

A validation failure returns one structured correction result to the model. It
must not execute a valid prefix of an invalid batch.

### 4. Read-only safety gate

The first live-capable implementation accepts only an explicit allow-list of
read-only tools. Tool names alone are insufficient when one tool can perform
both reads and writes, so eligibility belongs in registered tool metadata or a
request-local policy supplied by the harness.

Terminal or general shell tools are excluded from the first parallel live
probe even when the commands appear read-only. Command-string classification
is not a reliable security boundary.

### 5. Execution and result ordering

Execute accepted calls concurrently with `Promise.allSettled`. Preserve input
order when constructing the assistant `tool_calls` array and subsequent tool
history, regardless of completion order.

Each call receives a stable, unique `tool_call_id`. Each result, including an
error, must return with the matching identifier. One call failing must not
erase successful sibling results.

Apply a batch deadline plus the existing per-tool deadline. Cancellation must
stop unfinished work where the harness supports it and report each cancelled
call separately.

### 6. OpenAI response contract

For a parallel batch, emit one assistant message containing all accepted
`tool_calls`. The caller then returns one `role: tool` message per call with
the matching `tool_call_id`.

Streaming must assemble each call's arguments independently by index and emit
`finish_reason: "tool_calls"` only after the complete batch is represented.
Usage remains limited to real upstream values.

### 7. Hermes boundary

Before a live probe, prove offline whether Hermes:

1. sends `parallel_tool_calls: true`;
2. accepts one assistant message with two tool calls;
3. executes both calls;
4. returns both tool results with correct identifiers;
5. preserves both results in the next request history.

If Hermes serializes, drops, or rewrites one result, classify the Hermes
execution/history layer as the blocker. Do not compensate by fabricating a
parallel result inside the proxy.

## Offline TDD matrix

1. Default framing still says exactly one call.
2. Parallel framing permits two independent calls.
3. A fixed two-fence response parses into two calls in source order.
4. Two valid read-only calls receive distinct stable identifiers.
5. Both results return in source order even when completion order is reversed.
6. One rejection prevents the whole batch from starting.
7. One execution error preserves the successful sibling result.
8. A write-capable or unclassified tool rejects the experimental batch.
9. `parallel_tool_calls: false` follows the existing serialized path.
10. Streaming produces separate indexed argument buffers and `tool_calls`.
11. Every returned tool message uses the matching `tool_call_id`.
12. No test invents token usage.

## Isolated live probe

Run one measurement at a time on `127.0.0.1:4142` using the isolated Hermes
home and a valid `--in` directory. Before the request, prove the 4141 safety
gate, the 4142 listener address and PID-file equality, the debug-log growth
after health, and Hermes's `http://127.0.0.1:4142/v1` base URL.

Use exactly two independent read-only tools that are allow-listed without shell
interpretation. Capture:

- the request's `parallel_tool_calls` value;
- the raw assistant response;
- the number and identifiers of parsed calls;
- start and completion records for both executions;
- both tool results in the next request history;
- absolute debug-log lines for every transition.

Classify harness, logging, configuration, or environment faults as INVALID RUN.
A valid run is PASS only if one assistant turn contains at least two calls,
both execute, and both matching results return to history. Otherwise report the
first failing layer without enabling the feature by default.

## Rollout and kill switch

The proxy only translates protocol messages; it does not execute tools. Read-only eligibility and execution safety remain the client's responsibility.

Keep the feature off by default. Guard it with a request capability and an
environment kill switch such as `M365_NO_PARALLEL_TOOL_CALLS=1`. A later
opt-in may be considered only after offline tests and an isolated live PASS.

Do not broaden the read-only allow-list, enable terminal batching, or alter the
default framing as part of this experiment.
