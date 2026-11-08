import { afterEach, describe, expect, it, vi } from "vitest";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "opencode-m365");

/** log.ts reads the env once, at load, like the proxy does at startup. */
async function load(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.resetModules();
  return import("./log.js");
}

describe("debug log and frame dump paths", () => {
  afterEach(() => vi.unstubAllEnvs());

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
