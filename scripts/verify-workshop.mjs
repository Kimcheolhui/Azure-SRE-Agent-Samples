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
assert.ok(!ids.includes("recall"), "Removed reference section must not be present");
assert.ok(!/CURRICULUM_START|CURRICULUM_END|recall-card|data-section=/.test(markup),
  "Removed reference cards must not be present");
assert.ok(!/data-score=|data-rubric=|data-safety=/.test(markup), "Learner grading controls must not be present");
assert.ok(!ids.includes("outputs"), "Removed result index must not be present");
assert.ok(!/data-covers=|data-exercise=/.test(markup) && !ids.includes("coverage"),
  "Source mappings must not be present");
const outputTasks = ["foundation", ...Array.from({ length: 13 }, (_, index) => `lab${index}`),
  "judgment", "capstone", "cleanup"];
const outputs = [...markup.matchAll(/data-output-for="([^"]+)"/g)].map(match => match[1]);
assert.equal(outputs.length, outputTasks.length, "Expected one output example per task");
assert.equal(new Set(outputs).size, outputTasks.length, "Duplicate output examples");
assert.ok(outputTasks.every(task => outputs.includes(task)), "Missing task output example");
const imageSources = JSON.parse(readFileSync(resolve(root, "docs/image-sources.json"), "utf8"));
const figures = [...markup.matchAll(/<figure class="official-figure"([^>]*)>([\s\S]*?)<\/figure>/g)];
assert.equal(figures.length, 15, "Expected fifteen official reference images");
assert.equal(imageSources.images.length, figures.length, "Image provenance is incomplete");
const figureIds = new Set();
for (const [, attributes, contents] of figures) {
  const id = attributes.match(/data-image-id="([^"]+)"/)?.[1];
  assert.ok(!figureIds.has(id), `Duplicate official image: ${id}`);
  figureIds.add(id);
  const image = imageSources.images.find(item => item.id === id);
  assert.ok(image, `Missing image source: ${id}`);
  assert.ok(attributes.includes(`data-docs-url="${image.docsUrl}"`), `Wrong owning page: ${id}`);
  assert.ok(contents.includes(`src="${image.imageUrl}"`), `Wrong image URL: ${id}`);
  assert.ok(contents.includes(`href="${image.docsUrl}"`), `Missing source caption: ${id}`);
  assert.ok(contents.includes(imageSources.licenseUrl), `Missing license credit: ${id}`);
  assert.ok(contents.includes('referrerpolicy="no-referrer"') && contents.includes('loading="lazy"'),
    `Image loading policy missing: ${id}`);
  assert.ok(contents.includes('class="image-error"') && contents.includes("data-enlarge"),
    `Image fallback or zoom missing: ${id}`);
}
const checks = [...markup.matchAll(/data-check="([^"]+)"/g)].map((match) => match[1]);
assert.equal(checks.length, outputTasks.length);
assert.equal(checks.length, new Set(checks).size);
for (const [, source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  new Script(source);
}
for (const file of ["samples/payment-api/package-lock.json", "infra/main.bicep",
  "scripts/deploy.sh", "scripts/scenario.sh", "scripts/traffic.mjs",
  "operations/service-context.md", "operations/payment-investigation/SKILL.md",
  "tools/summarize_payments.py", "tools/inspect_pods.py", "k8s/workload.yaml",
  "samples/payment-api/Dockerfile", "scripts/connect.sh", "operations/recovery-check.txt",
  "docs/image-sources.json"]) {
  assert.ok(existsSync(resolve(root, file)), `Missing workshop artifact: ${file}`);
}
console.log(`Workshop verified: ${outputs.length} result examples, ${figures.length} credited figures, ${checks.length} progress checks and valid HTML/JavaScript.`);
