import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../docs/workshop.html", import.meta.url), "utf8");
const images = JSON.parse(readFileSync(new URL("../../docs/image-sources.json", import.meta.url), "utf8"));

function resultCode(name) {
  const match = html.match(new RegExp(`<pre data-result-json="${name}"><code>([\\s\\S]*?)</code></pre>`));
  assert.ok(match, `Missing result example: ${name}`);
  return match[1];
}

test("normal measured CLI example preserves native JSONL shape and recovery thresholds", () => {
  const rows = resultCode("healthy").trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(rows.map(row => row.summary), ["card", "bank"]);
  for (const row of rows) {
    assert.equal(row.count, 20);
    assert.equal(row.failureRate, 0);
    assert.ok(row.p95Ms <= 1000);
    assert.deepEqual(Object.keys(row).sort(), ["count", "failureRate", "p95Ms", "summary"]);
  }
});

test("Hook rejection has a nonempty reason and private output is explicitly illustrative", () => {
  const hook = JSON.parse(resultCode("hook"));
  assert.equal(hook.ok, false);
  assert.ok(hook.reason.length > 0);
  const version = JSON.parse(resultCode("private-version"));
  assert.equal(version.httpStatus, 200);
  assert.ok(version.resolvedAddresses[0].startsWith("10."));
  assert.match(version.version.sourceCommit, /^[0-9a-f]{40}$/);
  assert.ok(html.includes("가상 PE 주소"));
});

test("capstone output example contains submission format, not worked-case solutions", () => {
  const match = html.match(/<details class="result-example" id="output-capstone"[\s\S]*?<\/details>/);
  assert.ok(match);
  assert.ok(match[0].includes("제출 묶음"));
  assert.ok(match[0].includes("풀이/정답은 여기 넣지 않습니다"));
  assert.ok(!match[0].includes("가설 A provider 대기"));
});

test("official images use documented first-party URLs and remain inside matching result panels", () => {
  assert.equal(images.images.length, 15);
  for (const image of images.images) {
    const url = new URL(image.imageUrl);
    assert.equal(url.hostname, "learn.microsoft.com");
    assert.ok(url.pathname.startsWith("/en-us/azure/sre-agent/media/"));
    assert.ok(image.sourceUrl.startsWith("https://github.com/MicrosoftDocs/azure-docs/blob/main/articles/sre-agent/media/"));
    const panel = html.match(new RegExp(`<details class="result-example" id="output-${image.task}"[\\s\\S]*?</details>`));
    assert.ok(panel?.[0].includes(`data-image-id="${image.id}"`), `Image outside its result panel: ${image.id}`);
  }
});
