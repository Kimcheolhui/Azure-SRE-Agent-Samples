import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "docs/workshop.html"), "utf8");
const markup = html.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>");
assert.ok(html.includes('<html lang="ko">'));
assert.ok(!html.includes("FEATURE_LABS"), "Workshop still contains unfinished feature labs");
const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(ids.length, new Set(ids).size, "Duplicate HTML IDs");
for (const [, id] of markup.matchAll(/href="#([^"]+)"/g)) {
  assert.ok(ids.includes(id), `Broken anchor: ${id}`);
}
const voidTags = new Set(["meta", "link", "input", "br", "hr", "img", "source", "wbr"]);
const stack = [];
for (const match of markup.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
  const [, closing, rawTag] = match;
  const tag = rawTag.toLowerCase();
  if (voidTags.has(tag)) continue;
  if (closing) assert.equal(stack.pop(), tag, `Unbalanced closing tag ${tag}`);
  else stack.push(tag);
}
assert.equal(stack.length, 0, "Unclosed HTML tags");
const covered = new Set();
for (const [, spec] of html.matchAll(/data-covers="([^"]+)"/g)) {
  for (const range of spec.split(",")) {
    const match = range.trim().match(/^([3-6])\.(\d+)(?:-\1\.(\d+))?$/);
    assert.ok(match, `Invalid coverage range: ${range}`);
    const [, chapter, from, to = from] = match;
    for (let section = Number(from); section <= Number(to); section++) {
      const key = `${chapter}.${section}`;
      assert.ok(!covered.has(key), `Duplicate coverage: ${key}`);
      covered.add(key);
    }
  }
}
for (const [chapter, count] of [[3, 22], [4, 15], [5, 18], [6, 31]]) {
  for (let section = 1; section <= count; section++) {
    assert.ok(covered.has(`${chapter}.${section}`), `Missing original section ${chapter}.${section}`);
  }
}
assert.equal(covered.size, 86, "Unexpected section count");
const checks = [...html.matchAll(/data-check="([^"]+)"/g)].map((match) => match[1]);
assert.equal(checks.length, 15);
assert.equal(checks.length, new Set(checks).size);
for (const [, source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  new Script(source);
}
for (const file of ["samples/payment-api/package-lock.json", "infra/main.bicep",
  "scripts/deploy.sh", "scripts/scenario.sh", "scripts/traffic.mjs",
  "operations/service-context.md", "operations/payment-investigation/SKILL.md",
  "tools/summarize_payments.py", "operations/recovery-check.txt"]) {
  assert.ok(existsSync(resolve(root, file)), `Missing workshop artifact: ${file}`);
}
console.log(`Workshop verified: ${covered.size} original sections, ${checks.length} checkpoints, anchors and JavaScript valid.`);
