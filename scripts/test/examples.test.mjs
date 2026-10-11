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

test("Hook rejection has a nonempty reason and private AKS output is explicitly illustrative", () => {
  const hook = JSON.parse(resultCode("hook"));
  assert.equal(hook.ok, false);
  assert.ok(hook.reason.length > 0);
  assert.ok(html.includes("enablePrivateCluster=true"));
  assert.ok(html.includes("Pod 이름은 출력 형식 예시"));
  assert.ok(html.includes("namespace RBAC Reader"));
  assert.ok(!html.includes("azurewebsites.net"));
});

test("AKS instructions use Kubernetes scopes, immutable image and reconnect after rollout", () => {
  assert.ok(html.includes("ImagePullBackOff"));
  assert.ok(html.includes("Azure Kubernetes Service RBAC Writer"));
  assert.ok(html.includes("$CLUSTER_ID/namespaces/payments"));
  assert.ok(html.includes("port-forward"));
  assert.ok(html.includes("digest"));
  assert.ok(!/App Service|az webapp|Website Contributor|appsettings|app settings|read_workshop_version/.test(html));
});

test("Agent creation includes concrete names, separate observability and neutral initial setup", () => {
  const setup = html.split('<h3 id="agent-setup">')[1]?.split("<h3>0-4.")[0];
  assert.ok(setup, "Agent creation instructions are missing");
  for (const text of ["rg-payment-agent-kch01x7", "agent-payments-kch01x7",
    "appi-agent-payments-kch01x7", "law-agent-payments-kch01x7",
    "East US 2", "Azure OpenAI", "Workspace details", "기존 리소스 선택",
    "5,000 AAU", "Principal (Object) ID", "Review", "Reader"]) {
    assert.ok(setup.includes(text), `Missing explicit creation choice: ${text}`);
  }
  assert.ok(setup.includes("payment-telemetry Secret에 넣지 않습니다"));
  assert.ok(setup.includes("scenario.sh·예상 RCA를 연결/업로드하지 않습니다"));
  assert.ok(setup.includes("현재 기본 공급자는 Anthropic"));
  assert.ok(setup.includes("개별 모델이나 모델 deployment 이름을 선택하지 않습니다"));
  assert.ok(!/Azure-SRE-Agent-Samples에서.*코드.*조회/.test(setup));
});

test("integrated practice output contains record format rather than grading", () => {
  const match = html.match(/<details class="result-example" id="output-capstone"[\s\S]*?<\/details>/);
  assert.ok(match);
  assert.ok(match[0].includes("실습 기록"));
  assert.ok(!match[0].includes("채점"));
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

test("workshop omits learner grading, delayed study requirements and the removed output index", () => {
  assert.ok(!/recall-day\d|const delayed/.test(html));
  assert.ok(!/다음 날|일주일|24시간|지연 재시험|7일 뒤/.test(html));
  assert.ok(!/data-score|data-rubric|data-safety|mastery-score|capstone-score|reset-recall|자기 채점|자기평가/.test(html));
  assert.ok(!/id="outputs"|href="#outputs"|output-index/.test(html));
  assert.ok(!/id="coverage"|href="#coverage"|data-covers|원본 [1-8]\.\d/.test(html));
  assert.ok(!/사다리|큰 그림|상황극|빈 표|사건 가:|사건 나:|사건 다:|노트에|노트를|채점표/.test(html));
  assert.ok(html.includes('id="output-lab6"'));
  assert.ok(html.includes("평가·추정 지표의 의미"));
});
