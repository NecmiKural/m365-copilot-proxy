// Did the server append every turn to the conversation? Reads proxy debug logs
// (M365_DEBUG=1; files or directories, *.debug.log / debug.log found recursively)
// and checks the server's own count of user messages after each turn, which must
// run 1, 2, 3, … on one ConversationId. A turn whose count is below its position
// ran on an older copy of the conversation (docs/hypotheses.md §24 F64).
//
//   node scripts/fork-scan.mjs ~/.config/opencode-m365/debug.log
//   SHOW=1 node scripts/fork-scan.mjs <dir>     # one line per conversation
//
// Also compares the off-thread turns with the rest: how often the model repeated
// a tool call it had already made, and reasoned about "mismatched" responses.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
const walk = (p) => {
  let st; try { st = statSync(p); } catch { return; }
  if (st.isFile()) { files.push(p); return; }
  let names; try { names = readdirSync(p); } catch { return; }
  for (const n of names) {
    if (/^(?:appdata|node_modules|\.git)$/i.test(n)) continue;
    const q = join(p, n);
    let s; try { s = statSync(q); } catch { continue; }
    if (s.isDirectory()) walk(q); else if (/debug\.log$/.test(n)) files.push(q);
  }
};
process.argv.slice(2).forEach(walk);

const MISMATCH = /mismatch|unexpected|instead of|glitch|discrepanc|didn.t run|out of context/i;
const convs = [];
const turns = { on: { n: 0, calls: 0, repeats: 0, cot: 0 }, off: { n: 0, calls: 0, repeats: 0, cot: 0 } };
for (const f of files) {
  let cid = null, conv = null, t = null;
  const flush = () => {
    if (!t || t.count === null) return;
    const w = turns[t.count === t.pos ? "on" : "off"];
    w.n++; if (t.cot) w.cot++;
    if (t.call) { w.calls++; if (conv.calls.has(t.call)) w.repeats++; conv.calls.add(t.call); }
  };
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const run = line.match(/\[model\] run: .*?cid=([0-9a-f-]+)/);
    if (run) cid = run[1];
    if (/Chat turn \d+:/.test(line)) {
      flush();
      if (!conv || conv.cid !== cid) { conv = { file: f, cid, counts: [], calls: new Set() }; convs.push(conv); }
      conv.counts.push(null);
      t = { pos: conv.counts.length, count: null, call: null, cot: false };
      continue;
    }
    if (!t) continue;
    const tc = line.match(/"turnCount":(\d+)/);
    if (tc) { t.count = +tc[1]; conv.counts[t.pos - 1] = t.count; }
    const call = line.match(/\[handler\] Tool call: (.*)$/);
    if (call && !t.call) t.call = call[1].trim();
    if (line.includes('"addToChainOfThought":true') && MISMATCH.test(line)) t.cot = true;
  }
  flush();
}

const multi = convs.filter((c) => c.counts.filter((n) => n !== null).length >= 3);
const forked = multi.filter((c) => c.counts.some((n, i) => n !== null && n < i + 1));
if (process.env.SHOW) for (const c of multi) console.log(`${c.counts.join(",")}${forked.includes(c) ? "  FORKED" : ""}  ${c.file}`);
const pct = (a, b) => `${a}/${b} (${Math.round((100 * a) / Math.max(1, b))}%)`;
console.log(`${files.length} logs, ${multi.length} conversations with 3+ turns, forked: ${pct(forked.length, multi.length)}`);
console.log(`turns on an older copy: ${pct(turns.off.n, turns.off.n + turns.on.n)}`);
for (const [w, s] of Object.entries(turns)) {
  console.log(`  ${w === "on" ? "on the full thread" : "on an older copy  "}: repeated an earlier tool call ${pct(s.repeats, s.calls)}, 'mismatch' reasoning ${pct(s.cot, s.n)}`);
}
