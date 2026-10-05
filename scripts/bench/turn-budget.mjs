// Bench pacing, OFF unless M365_AVOID_THROTTLING=1: wait before a task until the
// account can afford it, so a sweep doesn't trip M365's `PerUserThrottled`
// (hypotheses §24 F58). Without it the bench runs as fast as before and
// still stops at the first throttled task.
//
// The model (F58): the account holds a bucket of ~100 turns that refills at
// ~1.6 turns a minute; every upstream turn takes one (fresh conversation or
// not, Disengaged included) and the throttle starts when it runs dry. Fitted on
// four premium-account onsets, then predicted three more on all three accounts
// to within a few turns without refitting — always a little optimistic (the
// throttle came with 6 turns still "left" at worst), hence the reserve.
//
// The proxy writes one `[session] Chat turn` line per upstream turn, and a
// `Turn result: Throttled` line per throttled turn, to its debug log when
// M365_DEBUG=1 — phase-sweep always sets it, and moves each arm's log into the
// sweep archive. This replays every recently modified debug log under
// ~/.config/opencode-m365 (archives included) through the bucket. Turns it
// can't see don't count: a proxy run without M365_DEBUG, the web client, another
// host on the same account. The reserve absorbs some of that; a sudden throttle
// still stops the bench as before.
//
// After a throttled turn it also waits for HOLD minutes of quiet: the throttle
// lifts with idle time, not with the bucket — on 2026-10-05 the premium account
// was still throttled 60 min after its only throttled turn, with nothing sent in
// between and the bucket long since refilled, while two non-premium accounts
// were served again 57 and 60 min after theirs (F58). 75 covers every case seen.
//
//   node scripts/bench/turn-budget.mjs status [--at ISO]     (works either way)
//   node scripts/bench/turn-budget.mjs wait [--need 12] [--label pi-rel]
//   import { waitForBudget } from "./turn-budget.mjs"   (run.mjs does)
//
// Env: M365_AVOID_THROTTLING=1 (turn the waiting on), M365_BUDGET_CAPACITY (100
//   turns), M365_BUDGET_REFILL (1.6 turns/min), M365_BUDGET_RESERVE (20 turns kept
//   back), M365_BUDGET_HOLD_MIN (75), M365_BUDGET_LOGS (more log files or dirs,
//   `:`-separated; phase-sweep adds its archive).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const num = (v, d) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

export function budgetConfig(env = process.env) {
  return {
    capacity: num(env.M365_BUDGET_CAPACITY, 100),
    refillPerMin: num(env.M365_BUDGET_REFILL, 1.6),
    reserve: num(env.M365_BUDGET_RESERVE, 20),
    holdMin: num(env.M365_BUDGET_HOLD_MIN, 75),
    // A bucket left alone for capacity/refill minutes (~1 h) is full, so a
    // replay that starts full this far back is exact for anything quieter.
    windowMin: 360,
    enabled: !!env.M365_AVOID_THROTTLING && env.M365_AVOID_THROTTLING !== "0",
    dirs: [join(homedir(), ".config", "opencode-m365"), ...(env.M365_BUDGET_LOGS ?? "").split(":").filter(Boolean)],
  };
}

const EVENT = /^\[(\d{4}-\d\d-\d\dT[\d:.]+Z)\] \[\w+\] \[session\] (Chat turn|Turn result: Throttled)/gm;
const LOG_FILE = /debug.*\.log$/;
const SKIP_DIR = /^(browser-profile|node_modules)$|frames/;

/** Turn and throttle events in log text: [{ t, kind: "turn" | "throttled", line }]. */
export function parseEvents(text) {
  const out = [];
  for (const m of text.matchAll(EVENT)) {
    out.push({ t: Date.parse(m[1]), kind: m[2] === "Chat turn" ? "turn" : "throttled", line: m[0] });
  }
  return out;
}

/** Debug logs under `dirs` (files allowed too) modified since `sinceMs`. */
export function findLogs(dirs, sinceMs, depth = 3) {
  const out = [];
  const walk = (p, d) => {
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.isFile()) { if (LOG_FILE.test(basename(p)) && st.mtimeMs >= sinceMs) out.push(p); return; }
    if (!st.isDirectory() || d > depth) return;
    let names = [];
    try { names = readdirSync(p); } catch { return; }
    for (const n of names) if (!SKIP_DIR.test(n)) walk(join(p, n), d + 1);
  };
  for (const d of dirs) walk(resolve(d), 0);
  return [...new Set(out)];
}

/**
 * Replay events through the bucket and report it at `nowMs`. Pure.
 * Events before `nowMs - windowMin` are ignored (the bucket starts full there);
 * the same log line seen in two files counts once.
 */
export function replay(events, nowMs, cfg) {
  const start = nowMs - cfg.windowMin * 60_000;
  const seen = new Set();
  const evs = events
    .filter((e) => e.t >= start && e.t <= nowMs && !seen.has(e.line) && seen.add(e.line))
    .sort((a, b) => a.t - b.t);
  let level = cfg.capacity, last = start, turns = 0, lastThrottle = null;
  for (const e of evs) {
    level = Math.min(cfg.capacity, level + ((e.t - last) / 60_000) * cfg.refillPerMin);
    last = e.t;
    if (e.kind === "turn") { level -= 1; turns++; }
    else { level = Math.min(level, 0); lastThrottle = e.t; }
  }
  level = Math.min(cfg.capacity, level + ((nowMs - last) / 60_000) * cfg.refillPerMin);
  return { level, turns, lastThrottle };
}

/**
 * Whether a task needing `need` turns may start now, and if not, how long until
 * it may (assuming nothing else spends turns meanwhile).
 */
export function decide(state, need, nowMs, cfg) {
  const want = need + cfg.reserve;
  const holdUntil = state.lastThrottle == null ? 0 : state.lastThrottle + cfg.holdMin * 60_000;
  const refillMs = state.level >= want ? 0 : ((want - state.level) / cfg.refillPerMin) * 60_000;
  const waitMs = Math.max(holdUntil - nowMs, refillMs, 0);
  const reason = holdUntil > nowMs && holdUntil - nowMs >= refillMs ? "throttle hold" : "refill";
  return { ok: waitMs === 0, waitMs, want, reason };
}

export function budgetStatus(nowMs = Date.now(), cfg = budgetConfig()) {
  const logs = findLogs(cfg.dirs, nowMs - cfg.windowMin * 60_000);
  const events = logs.flatMap((f) => { try { return parseEvents(readFileSync(f, "utf8")); } catch { return []; } });
  return { ...replay(events, nowMs, cfg), logs: logs.length };
}

const fmtMin = (ms) => `${(ms / 60_000).toFixed(1)} min`;

/** Block until the account can afford `need` more turns (see the header). A no-op unless M365_AVOID_THROTTLING is set. */
export async function waitForBudget({ need = 12, label = "bench", log = console.log, cfg = budgetConfig(), now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!cfg.enabled) return { waitedMs: 0 };
  const t0 = now();
  let announced = false;
  for (;;) {
    const st = budgetStatus(now(), cfg);
    const d = decide(st, need, now(), cfg);
    if (d.ok) {
      if (announced) log(`[${label}] pacing: resumed after ${fmtMin(now() - t0)} (bucket ~${st.level.toFixed(0)})`);
      return { waitedMs: now() - t0 };
    }
    if (!announced) {
      log(`[${label}] pacing: bucket ~${st.level.toFixed(0)}/${cfg.capacity} turns, need ${need} + reserve ${cfg.reserve}` +
        `${d.reason === "throttle hold" ? `, throttled at ${new Date(st.lastThrottle).toISOString()}` : ""} — waiting ~${fmtMin(d.waitMs)} (${d.reason})`);
      announced = true;
    }
    // Re-read the logs at least once a minute: something else may be spending turns.
    await sleep(Math.min(Math.max(d.waitMs, 1000), 60_000));
  }
}

async function main(argv) {
  const cmd = argv[0] ?? "status";
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const cfg = budgetConfig();
  if (cmd === "status") {
    const at = opt("--at") ? Date.parse(opt("--at")) : Date.now();
    const st = budgetStatus(at, cfg);
    const d = decide(st, Number(opt("--need", "12")), at, cfg);
    console.log(`bucket ~${st.level.toFixed(1)}/${cfg.capacity} turns at ${new Date(at).toISOString()} (refill ${cfg.refillPerMin}/min, reserve ${cfg.reserve}; ${st.turns} turns in the last ${cfg.windowMin / 60} h from ${st.logs} logs` +
      `${st.lastThrottle ? `; last throttled turn ${new Date(st.lastThrottle).toISOString()}` : ""}) — ${d.ok ? "a task may start" : `wait ~${fmtMin(d.waitMs)} (${d.reason})`}` +
      `${cfg.enabled ? "" : " [pacing is off: set M365_AVOID_THROTTLING=1 to have the bench wait]"}`);
  } else if (cmd === "wait") {
    await waitForBudget({ need: Number(opt("--need", "12")), label: opt("--label", "bench"), cfg });
  } else {
    console.error("usage: turn-budget.mjs status [--at ISO] [--need N] | wait [--need N] [--label L]");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
