import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import assert from "node:assert/strict";
import { collectMappings, chapterCounts, renderCurriculum, insertCurriculum } from "./build-curriculum.mjs";

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
const covered = collectMappings(markup);
for (const [index, count] of chapterCounts.entries()) {
  const chapter = index + 1;
  for (let section = 1; section <= count; section++) {
    assert.ok(covered.has(`${chapter}.${section}`), `Missing original section ${chapter}.${section}`);
  }
}
assert.equal(covered.size, 105, "Unexpected section count");
const curriculum = JSON.parse(readFileSync(resolve(root, "docs/curriculum.json"), "utf8"));
assert.equal(insertCurriculum(html, renderCurriculum(curriculum, html)), html, "Recall cards are stale");
const scores = [...markup.matchAll(/data-score="([^"]+)"/g)].map(match => match[1]);
assert.equal(scores.length, 105);
assert.equal(new Set(scores).size, 105);
assert.ok(scores.every(number => covered.has(number)), "Assessment section has no exercise");
assert.equal([...markup.matchAll(/data-rubric="/g)].length, 10);
assert.equal([...markup.matchAll(/data-safety="true"/g)].length, 4);
const checks = [...markup.matchAll(/data-check="([^"]+)"/g)].map((match) => match[1]);
assert.equal(checks.length, 20);
assert.equal(checks.length, new Set(checks).size);
for (const [, source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  new Script(source);
}
for (const file of ["samples/payment-api/package-lock.json", "infra/main.bicep",
  "scripts/deploy.sh", "scripts/scenario.sh", "scripts/traffic.mjs",
  "operations/service-context.md", "operations/payment-investigation/SKILL.md",
  "tools/summarize_payments.py", "operations/recovery-check.txt", "docs/curriculum.json"]) {
  assert.ok(existsSync(resolve(root, file)), `Missing workshop artifact: ${file}`);
}
console.log(`Workshop verified: ${covered.size} sections and recall cards, ${checks.length} task checks, capstone, anchors and JavaScript valid.`);
