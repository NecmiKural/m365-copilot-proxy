import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

const CONFIG_DIR = join(homedir(), ".config", "opencode-m365");
// M365_LOG_FILE and M365_FRAME_DIR are relative to CONFIG_DIR (an absolute path
// is taken as is), so a bench sweep can point each proxy straight into its archive.
const LOG_FILE = resolve(CONFIG_DIR, process.env.M365_LOG_FILE || "debug.log");
const LOG_DIR = dirname(LOG_FILE);
/** Where M365_DUMP_FRAMES=1 writes one `<requestId>.ndjson` per turn. */
export const FRAME_DIR = resolve(CONFIG_DIR, process.env.M365_FRAME_DIR || "frames");
/** Optional content-free JSONL reliability observations. */
export const OBSERVATIONS_PATH = process.env.M365_OBSERVATIONS_FILE
  ? resolve(CONFIG_DIR, process.env.M365_OBSERVATIONS_FILE)
  : null;

// M365_TRACE implies debug logging and disables all payload truncation, so
// every WS frame, prompt, and response is recorded in full for reverse
// engineering. M365_DEBUG keeps the lighter, truncated logging.
const trace = !!process.env.M365_TRACE;
const enabled = !!process.env.M365_DEBUG || trace;
// Tailing ~/.config/opencode-m365/debug.log in a second terminal is the usual
// way to watch a run; this mirrors the same lines to the proxy's own stdout so
// one terminal is enough. Safe here because the proxy speaks HTTP — stdout is
// not a protocol channel.
const stdoutEnabled = !!process.env.M365_LOG_STDOUT;
const configuredMaxBytes = Number(process.env.M365_LOG_MAX_BYTES);
const maxBytes = Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0
  ? configuredMaxBytes
  : null;
function existingSize(path: string | null): number {
  if (maxBytes === null || path === null) return 0;
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

let writtenBytes = existingSize(LOG_FILE);
let observationBytes = existingSize(OBSERVATIONS_PATH);

function appendRotating(path: string, line: string, currentBytes: number): number {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const lineBytes = Buffer.byteLength(line);
    if (maxBytes !== null && currentBytes > 0 && currentBytes + lineBytes > maxBytes) {
      rmSync(`${path}.1`, { force: true });
      renameSync(path, `${path}.1`);
      currentBytes = 0;
    }
    appendFileSync(path, line);
    return currentBytes + lineBytes;
  } catch {
    return currentBytes;
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: string, component: string, ...args: unknown[]) {
  if (!enabled) return;
  const msg = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
    .join(" ");
  const line = `[${timestamp()}] [${level}] [${component}] ${msg}\n`;
  if (stdoutEnabled) process.stdout.write(line);
  writtenBytes = appendRotating(LOG_FILE, line, writtenBytes);
}

type ObservationKind =
  | "request"
  | "recovery"
  | "recovery_result"
  | "final_without_tool_after_recovery"
  | "arg_validation"
  | "upstream_http_error"
  | "throttle"
  | "fallback_model"
  | "priority_quota";

export interface Observation {
  kind: ObservationKind;
  conversationId?: string;
  model?: string;
  stream?: boolean;
  mode?: string;
  tools?: number;
  rule?: string;
  attempt?: number;
  hasToolCalls?: boolean;
  result?: string;
  status?: number;
  remaining?: number;
}

const observationFields: Record<ObservationKind, ReadonlyArray<keyof Observation>> = {
  request: [],
  recovery: ["rule", "attempt"],
  recovery_result: ["hasToolCalls"],
  final_without_tool_after_recovery: [],
  arg_validation: ["result"],
  upstream_http_error: ["status"],
  throttle: [],
  fallback_model: [],
  priority_quota: ["remaining"],
};

/** Append one explicitly allowlisted metadata event. Content fields are never copied. */
export function recordObservation(observation: Observation): void {
  if (OBSERVATIONS_PATH === null) return;
  const event: Record<string, unknown> = {
    ts: timestamp(),
    kind: observation.kind,
  };
  if (observation.conversationId !== undefined) {
    event.conversation = createHash("sha256")
      .update(observation.conversationId)
      .digest("hex")
      .slice(0, 12);
  }
  if (observation.model !== undefined) event.model = observation.model;
  if (observation.stream !== undefined) event.stream = observation.stream;
  if (observation.mode !== undefined) event.mode = observation.mode;
  if (observation.tools !== undefined) event.tools = observation.tools;
  for (const field of observationFields[observation.kind] ?? []) {
    const value = observation[field];
    if (value !== undefined) event[field] = value;
  }
  observationBytes = appendRotating(
    OBSERVATIONS_PATH,
    `${JSON.stringify(event)}\n`,
    observationBytes,
  );
}

export function createLogger(component: string) {
  return {
    info: (...args: unknown[]) => write("INFO", component, ...args),
    error: (...args: unknown[]) => write("ERROR", component, ...args),
    debug: (...args: unknown[]) => write("DEBUG", component, ...args),
  };
}

/**
 * Truncate a string for logging unless M365_TRACE is set, in which case the
 * full value is returned so the debug file captures complete payloads.
 */
export function trunc(value: string, limit: number): string {
  if (trace) return value;
  return value.slice(0, limit);
}

export const LOG_PATH = LOG_FILE;

/** Whether this process writes its debug log (M365_DEBUG / M365_TRACE). */
export function fileLoggingEnabled(): boolean {
  return enabled;
}
