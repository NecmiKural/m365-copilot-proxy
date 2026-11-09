import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSummary, parseArgs, summarize } from "./observations-summary.mjs";

describe("observations-summary", () => {
  it("summarizes a fixture and filters by --since", async () => {
    const dir = mkdtempSync(join(tmpdir(), "observations-"));
    const file = join(dir, "fixture.ndjson");
    const events = [
      { ts: "2026-11-09T08:00:00.000Z", kind: "request" },
      { ts: "2026-11-09T09:00:00.000Z", kind: "recovery", rule: "H52" },
      { ts: "2026-11-09T09:01:00.000Z", kind: "recovery_result", hasToolCalls: true },
      { ts: "2026-11-09T09:02:00.000Z", kind: "recovery", rule: "H51" },
      { ts: "2026-11-09T09:03:00.000Z", kind: "recovery_result", hasToolCalls: false },
      { ts: "2026-11-09T09:04:00.000Z", kind: "throttle" },
      { ts: "2026-11-09T09:05:00.000Z", kind: "fallback_model" },
    ];
    writeFileSync(file, `${events.map(JSON.stringify).join("\n")}\n`);
    const options = parseArgs(["--file", file, "--since", "2026-11-09T08:30:00Z"]);
    const text = formatSummary(await summarize(options.file, options.since));
    expect(text).not.toContain("request:");
    expect(text).toContain("recovery: 2");
    expect(text).toContain("Recovery success: 1/2 (50.0%)");
    expect(text).toContain("H51: 1");
    expect(text).toContain("H52: 1");
    expect(text).toContain("Genuine HTTP 429: 1");
    expect(text).toContain("Fallback model: 1");
  });

  it("rejects an invalid --since value", () => {
    expect(() => parseArgs(["--since", "not-a-date"])).toThrow("valid ISO timestamp");
  });
});
