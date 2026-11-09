#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export function parseArgs(args) {
  const options = {
    file: process.env.M365_OBSERVATIONS_FILE
      ? resolve(join(homedir(), ".config", "opencode-m365"), process.env.M365_OBSERVATIONS_FILE)
      : join(homedir(), ".config", "opencode-m365", "observations.ndjson"),
    since: null,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) options.file = resolve(args[++i]);
    else if (args[i] === "--since" && args[i + 1]) options.since = new Date(args[++i]);
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (options.since && Number.isNaN(options.since.getTime())) {
    throw new Error("--since must be a valid ISO timestamp");
  }
  return options;
}

export async function summarize(file, since = null) {
  const counts = new Map();
  const recoveryRules = new Map();
  let recoveryResults = 0;
  let recoverySuccesses = 0;
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (since && new Date(event.ts) < since) continue;
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
    if (event.kind === "recovery" && event.rule) {
      recoveryRules.set(event.rule, (recoveryRules.get(event.rule) ?? 0) + 1);
    }
    if (event.kind === "recovery_result") {
      recoveryResults++;
      if (event.hasToolCalls === true) recoverySuccesses++;
    }
  }
  return { counts, recoveryRules, recoveryResults, recoverySuccesses };
}

export function formatSummary(summary) {
  const percentage = summary.recoveryResults
    ? ((summary.recoverySuccesses / summary.recoveryResults) * 100).toFixed(1)
    : "n/a";
  const rows = [
    "Observation counts:",
    ...[...summary.counts].sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, count]) => `  ${kind}: ${count}`),
    `Recovery success: ${summary.recoverySuccesses}/${summary.recoveryResults} (${percentage}${percentage === "n/a" ? "" : "%"})`,
    "Recovery rules:",
    ...([...summary.recoveryRules].length
      ? [...summary.recoveryRules].sort(([a], [b]) => a.localeCompare(b))
        .map(([rule, count]) => `  ${rule}: ${count}`)
      : ["  none"]),
    `Genuine HTTP 429: ${summary.counts.get("throttle") ?? 0}`,
    `Fallback model: ${summary.counts.get("fallback_model") ?? 0}`,
  ];
  return `${rows.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.stdout.write(formatSummary(await summarize(options.file, options.since)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
