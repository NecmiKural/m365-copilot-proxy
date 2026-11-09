import { afterEach, describe, expect, it, vi } from "vitest";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const CONFIG_DIR = join(homedir(), ".config", "opencode-m365");

/** log.ts reads the env once, at load, like the proxy does at startup. */
async function load(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.resetModules();
  return import("./log.js");
}

describe("debug log and frame dump paths", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempLog(name = "debug.log") {
    const dir = mkdtempSync(join(tmpdir(), "m365-log-"));
    tempDirs.push(dir);
    return join(dir, name);
  }

  it("default to debug.log and frames/ in the config dir", async () => {
    const m = await load({ M365_LOG_FILE: undefined, M365_FRAME_DIR: undefined });
    expect(m.LOG_PATH).toBe(join(CONFIG_DIR, "debug.log"));
    expect(m.FRAME_DIR).toBe(join(CONFIG_DIR, "frames"));
  });

  it("take M365_LOG_FILE and M365_FRAME_DIR relative to the config dir", async () => {
    const m = await load({ M365_LOG_FILE: "my/log.log", M365_FRAME_DIR: "my/frames" });
    expect(m.LOG_PATH).toBe(join(CONFIG_DIR, "my", "log.log"));
    expect(m.FRAME_DIR).toBe(join(CONFIG_DIR, "my", "frames"));
  });

  it("take an absolute path as is, and an empty one as unset", async () => {
    const absoluteLog = resolve("tmp", "x", "a.log");
    const m = await load({ M365_LOG_FILE: absoluteLog, M365_FRAME_DIR: "" });
    expect(m.LOG_PATH).toBe(absoluteLog);
    expect(m.FRAME_DIR).toBe(join(CONFIG_DIR, "frames"));
  });


  it("rotates to one backup before a write exceeds M365_LOG_MAX_BYTES", async () => {
    const log = tempLog();
    writeFileSync(log, "seed");
    const m = await load({
      M365_DEBUG: "1",
      M365_LOG_FILE: log,
      M365_LOG_MAX_BYTES: "5",
    });

    m.createLogger("test").info("next");

    expect(readFileSync(`${log}.1`, "utf8")).toBe("seed");
    expect(readFileSync(log, "utf8")).toContain("[test] next");
  });

  it("does not rotate when M365_LOG_MAX_BYTES is unset", async () => {
    const log = tempLog();
    writeFileSync(log, "seed");
    const m = await load({
      M365_DEBUG: "1",
      M365_LOG_FILE: log,
      M365_LOG_MAX_BYTES: undefined,
    });

    m.createLogger("test").info("next");

    expect(existsSync(`${log}.1`)).toBe(false);
    expect(readFileSync(log, "utf8")).toMatch(/^seed.*\[test\] next/s);
  });

  it("does not create an observations file when M365_OBSERVATIONS_FILE is unset", async () => {
    const observations = tempLog("observations.ndjson");
    const m = await load({
      M365_OBSERVATIONS_FILE: undefined,
      M365_LOG_MAX_BYTES: undefined,
    });

    m.recordObservation({
      kind: "request",
      conversationId: "conversation-secret",
      model: "test-model",
      stream: false,
      mode: "full",
      tools: 2,
    });

    expect(existsSync(observations)).toBe(false);
    expect(m.OBSERVATIONS_PATH).toBeNull();
  });

  it("writes content-free JSONL observations when enabled", async () => {
    const observations = tempLog("observations.ndjson");
    const sentinel = "PHASE13_SECRET_PROMPT_SENTINEL";
    const m = await load({
      M365_OBSERVATIONS_FILE: observations,
      M365_LOG_MAX_BYTES: undefined,
    });

    m.recordObservation({
      kind: "recovery",
      conversationId: "conversation-secret",
      model: "test-model",
      stream: true,
      mode: "delta",
      tools: 3,
      rule: "H51",
      attempt: 1,
      prompt: sentinel,
      response: sentinel,
      command: sentinel,
      path: sentinel,
      token: sentinel,
    } as any);

    const text = readFileSync(observations, "utf8");
    const event = JSON.parse(text.trim());
    expect(event).toMatchObject({
      kind: "recovery",
      model: "test-model",
      stream: true,
      mode: "delta",
      tools: 3,
      rule: "H51",
      attempt: 1,
    });
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.conversation).toMatch(/^[a-f0-9]{12}$/);
    expect(event.conversation).not.toBe("conversation-secret");
    expect(text).not.toContain(sentinel);
    expect(Object.keys(event).sort()).toEqual([
      "attempt", "conversation", "kind", "mode", "model", "rule", "stream", "tools", "ts",
    ]);
  });

  it("allows only fields belonging to each observation kind", async () => {
    const observations = tempLog("observations.ndjson");
    const sentinel = "PHASE13_RESPONSE_SENTINEL";
    const m = await load({ M365_OBSERVATIONS_FILE: observations });

    m.recordObservation({
      kind: "upstream_http_error",
      conversationId: "conv",
      model: "model",
      stream: false,
      mode: "full",
      tools: 0,
      status: 503,
      remaining: 99,
      hasToolCalls: true,
      response: sentinel,
    } as any);

    const event = JSON.parse(readFileSync(observations, "utf8").trim());
    expect(event.status).toBe(503);
    expect(event.remaining).toBeUndefined();
    expect(event.hasToolCalls).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain(sentinel);
  });

  it("rotates observations to one backup using M365_LOG_MAX_BYTES", async () => {
    const observations = tempLog("observations.ndjson");
    writeFileSync(observations, "old-observations\n");
    const m = await load({
      M365_OBSERVATIONS_FILE: observations,
      M365_LOG_MAX_BYTES: "20",
    });

    m.recordObservation({
      kind: "request",
      conversationId: "conv",
      model: "model",
      stream: false,
      mode: "full",
      tools: 0,
    });

    expect(readFileSync(`${observations}.1`, "utf8")).toBe("old-observations\n");
    expect(JSON.parse(readFileSync(observations, "utf8").trim()).kind).toBe("request");
  });

  it("rotates a Windows absolute log path without changing FRAME_DIR", async () => {
    const log = tempLog("windows-path.log");
    writeFileSync(log, "seed");
    const m = await load({
      M365_DEBUG: "1",
      M365_LOG_FILE: log,
      M365_FRAME_DIR: "frames-kept-separate",
      M365_LOG_MAX_BYTES: "5",
    });

    m.createLogger("test").info("next");

    expect(m.LOG_PATH).toBe(log);
    expect(m.FRAME_DIR).toBe(join(CONFIG_DIR, "frames-kept-separate"));
    expect(readFileSync(`${log}.1`, "utf8")).toBe("seed");
  });
});
