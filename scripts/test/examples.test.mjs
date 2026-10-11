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

test("request duration percentiles use numeric milliseconds without timespan division", () => {
  const investigation = readFileSync(new URL("../../queries/investigation.kql", import.meta.url), "utf8");
  for (const contents of [html, investigation]) {
    assert.ok(contents.includes("p95Ms=percentile(duration, 95)"));
    assert.ok(contents.includes("p95Ms=percentile(DurationMs, 95)"));
    assert.ok(!/(?:duration|DurationMs)\s*\/\s*\d+(?:ms|s|m|h|d)\b/.test(contents),
      "Numeric millisecond durations must not be divided by a timespan");
  }
  assert.ok(html.includes("<code>duration</code>은 이미 밀리초 단위의 <code>real</code> 값입니다"));
});

test("Lab 1 Agent prompt leaves source selection and log distinctions to the Agent", () => {
  const lab = html.split('<section id="lab1">')[1]?.split("</section>")[0];
  const prompt = lab?.match(/<pre class="prompt"><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
  assert.ok(prompt);
  assert.ok(!/Application Insights|APP_INSIGHTS_RESOURCE_ID|Resource Health|Activity Log|audit/.test(prompt));
  for (const text of ["카드/계좌별 요청 수, 실패율, p95", "provider 종속성 시간",
    "쿼리와 UTC 구간, 실제 조회한 원본", "Pod Ready/restarts, image digest, 이벤트"]) {
    assert.ok(prompt.includes(text), `Baseline prompt must preserve the requested evidence: ${text}`);
  }
});

test("Lab 2 incident prompt only contains the user's symptom and investigation request", () => {
  const lab = html.split('<section id="lab2">')[1]?.split("</section>")[0];
  const prompt = lab?.match(/<pre class="prompt"><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
  assert.ok(prompt);
  assert.equal(prompt, "카드 결제가 느리다는 보고가 있어. 원인과 영향 범위를 조사해 줘.");
  assert.ok(!lab.includes("발생 구간과 변경 금지 조건만 전달"));
});

test("each remaining Lab 2 incident has a symptom-only Agent prompt before recovery", () => {
  const lab = html.split('<section id="lab2">')[1]?.split("</section>")[0];
  assert.ok(lab);
  for (const [scenario, expectedPrompt] of [
    ["payment-exception", "카드 결제가 실패한다는 보고가 있어. 원인과 영향 범위를 조사해 줘."],
    ["unavailable", "카드와 계좌 결제가 모두 실패한다는 보고가 있어. 원인과 영향 범위를 조사해 줘."],
    ["image-pull-failure", "새 버전 배포가 완료되지 않는다는 보고가 있어. 원인과 영향 범위를 조사해 줘."]
  ]) {
    const start = lab.indexOf(`bash scripts/scenario.sh "$RG" "$CLUSTER" ${scenario}`);
    assert.ok(start >= 0, `Missing incident setup: ${scenario}`);
    const recovery = lab.indexOf('bash scripts/scenario.sh "$RG" "$CLUSTER" healthy', start);
    assert.ok(recovery > start, `Missing recovery after ${scenario}`);
    const investigation = lab.slice(start, recovery);
    assert.ok(investigation.includes("SRE Agent 채팅에 다음 문장을 입력합니다."));
    const prompt = investigation.match(/<pre class="prompt"><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
    assert.equal(prompt, expectedPrompt);
    assert.ok(investigation.includes("Agent의 조사가 끝난 뒤"));
  }
  for (const [, block] of lab.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)) {
    assert.ok(!(block.includes('bash scripts/scenario.sh "$RG" "$CLUSTER" healthy') &&
      /\b(?:payment-exception|unavailable|image-pull-failure)\b/.test(block)),
    "An incident setup block must not restore the workload before the Agent can investigate");
  }
});

test("Lab 1 embeds the Kubernetes queries and executable read-only inspection commands", () => {
  const logs = html.match(/<li id="lab1-kubernetes-logs">([\s\S]*?)<\/li>/)?.[1];
  const cli = html.match(/<li id="lab1-kubernetes-cli">([\s\S]*?)<\/li>/)?.[1];
  assert.ok(logs);
  assert.ok(cli);
  const kubernetes = readFileSync(new URL("../../queries/kubernetes.kql", import.meta.url), "utf8");
  const queries = kubernetes.replace(/^\/\/.*\n/gm, "").trim().split(/\r?\n\r?\n/);
  assert.equal(queries.length, 3);
  for (const query of queries) {
    assert.ok(logs.includes(`<pre><code>${query.replaceAll(">", "&gt;")}</code></pre>`),
      "Each Kubernetes query must be identical in the workshop and query file");
  }
  for (const command of ["az monitor data-collection rule association list --resource",
    'az monitor data-collection rule show -g "$RG" -n "dcr-$CLUSTER"']) {
    assert.ok(logs.includes(command), `Missing DCR inspection command: ${command}`);
  }
  for (const text of ["namespaceFilteringMode=Off", "enableContainerLogV2=true",
    "workspaceResourceId", "새 이벤트가 없거나 수집 설정에 따라 0건"]) {
    assert.ok(logs.includes(text), `Missing collection/output explanation: ${text}`);
  }
  for (const command of ['export KUBECONFIG="$PWD/artifacts/kubeconfig-$CLUSTER"',
    "kubectl -n payments get deployments -l application=payments",
    "kubectl -n payments get pods -l application=payments -o wide",
    'kubectl -n payments describe pod "$POD"',
    "kubectl -n payments get events --sort-by=.metadata.creationTimestamp"]) {
    assert.ok(cli.includes(command), `Missing executable inspection command: ${command}`);
  }
  assert.ok(cli.includes("IMAGE_ID:.status.containerStatuses[*].imageID"));
  assert.ok(cli.includes("POD=$(kubectl"));
  assert.ok(cli.includes("2/2") && cli.includes("1/1"));
  assert.ok(!/\b(?:kubectl (?:apply|patch|delete|scale)|az monitor data-collection rule (?:create|update))\b/.test(logs + cli),
    "Baseline inspection must not change resources");
});

test("Hook rejection has a nonempty reason and private AKS output is explicitly illustrative", () => {
  const hook = JSON.parse(resultCode("hook"));
  assert.equal(hook.ok, false);
  assert.ok(hook.reason.length > 0);
  assert.ok(html.includes("enablePrivateCluster=true"));
  assert.ok(html.includes("Pod 이름은 출력 형식 예시"));
  assert.ok(html.includes("Azure Kubernetes Service RBAC Reader"));
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
  for (const text of ["rg-payment-agent-kch01x7", "sre-payments-kch01x7",
    "East US 2", "Anthropic", "Resource group → Create new", "Application Insights",
    "Create new", "Log Analytics workspace가 자동 생성",
    "5,000 AAU", "Principal (Object) ID", "Review", "Reader"]) {
    assert.ok(setup.includes(text), `Missing explicit creation choice: ${text}`);
  }
  assert.ok(setup.includes("payment-telemetry Secret에 넣지 않습니다"));
  assert.ok(setup.includes("scenario.sh·예상 RCA를 연결/업로드하지 않습니다"));
  assert.ok(setup.includes("이번 구성에서는 <strong>Anthropic을 사용</strong>"));
  assert.ok(setup.includes("개별 모델이나 모델 deployment 이름을 선택하지 않습니다"));
  assert.ok(setup.includes('Model provider</td><td><strong>Anthropic</strong>'));
  assert.ok(!setup.includes("Azure OpenAI"));
  assert.ok(!html.includes('export AGENT_APP_INSIGHTS='));
  assert.ok(!html.includes('export AGENT_WORKSPACE='));
  assert.ok(!setup.includes("Log Analytics workspaces” → Create"));
  assert.ok(!setup.includes("Application Insights” → Create"));
  assert.ok(html.includes('export AGENT_NAME="sre-payments-$SUFFIX"'));
  const subscription = setup.match(/<tr><td>Subscription<\/td>([\s\S]*?)<\/tr>/)?.[1];
  assert.ok(subscription);
  assert.ok(subscription.includes("&lt;YOUR_SUBSCRIPTION_NAME&gt;"));
  assert.ok(subscription.includes("&lt;YOUR_SUBSCRIPTION_ID&gt;"));
  assert.ok(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(subscription),
    "Published subscription examples must use placeholders, not actual subscription identifiers");
  assert.ok(!/Azure-SRE-Agent-Samples에서.*코드.*조회/.test(setup));
});

test("Portal resource names use the filled suffix while terminal commands keep variables", () => {
  const prose = html.replace(/<pre\b[\s\S]*?<\/pre>|<script\b[\s\S]*?<\/script>/g, "");
  for (const [, path] of prose.matchAll(/<span class="path">([\s\S]*?)<\/span>/g)) {
    assert.ok(!/\$[A-Z_]+/.test(path), "Portal paths must not contain shell variables");
  }
  const inlineCodes = [...prose.matchAll(/<code>([\s\S]*?)<\/code>/g)].map(([, code]) => code);
  assert.ok(!inlineCodes.some(code => /^(?:[a-z0-9-]*\$(?:SUFFIX|CLUSTER|ACR|RG))\b/.test(code)),
    "UI resource names must be fully specified");
  for (const name of ["ag-payments-kch01x7", "payment-failures-kch01x7",
    "rg-payment-grafana-kch01x7",
    "amg-sre-kch01x7", "payments-kch01x7", "kv-sre-kch01x7",
    "rg-payment-keyvault-kch01x7", "vnet-aks-payment-kch01x7"]) {
    assert.ok(inlineCodes.includes(name), `Missing complete UI resource name: ${name}`);
  }
  const lab3 = html.split('<section id="lab3">')[1]?.split("</section>")[0];
  assert.ok(lab3?.includes("<code>ag-payments-kch01x7</code>"));
  assert.ok(lab3.includes("<code>rg-payment-kch01x7</code>"));
  assert.ok(lab3.includes('bash scripts/monitoring.sh "$RG" "$CLUSTER" alerts'));
  assert.ok(html.includes('export CLUSTER="aks-payment-$SUFFIX"'));
  assert.ok(html.includes('bash scripts/deploy.sh "$RG" "$CLUSTER" "$ACR" "$LOCATION"'));
  assert.ok(html.includes('az monitor data-collection rule show -g "$RG" -n "dcr-$CLUSTER"'));
});

test("response plan setup specifies the matching values without prescribing investigation steps", () => {
  const setup = html.match(/<h3 id="response-plan-setup">([\s\S]*?)(?=<h3\b)/)?.[1];
  assert.ok(setup, "Response plan setup requires a linkable section");
  assert.ok(setup.includes('<table id="response-plan-values">'));
  for (const text of ["payment-failure-review", "payment-failures-kch01x7",
    "Azure Monitor", "Review"]) {
    assert.ok(setup.includes(text), `Missing explicit response plan value: ${text}`);
  }
  assert.ok(!/SOURCE_COMMIT|경쟁 가설|&lt;CLUSTER_ID&gt;|20쌍 결제|p95 ≤1000ms/.test(setup),
    "Response plan setup must not coach the investigation or require resource IDs in instructions");
  assert.ok(!html.includes("response plan의 impacted service/title 조건과 handler 지침에"));
  const connection = html.split("<h3>3-2.")[1]?.split('<h3 id="response-plan-setup">')[0];
  assert.ok(connection?.includes("law-aks-payment-kch01x7"));
  assert.ok(connection.includes("rg-payment-kch01x7"));
  assert.ok(setup.includes("Sev2 / Warning"));
  assert.ok(setup.includes("<td>Title does not contain</td><td><strong>빈칸</strong>"));
  assert.ok(setup.includes("Step 2: Incidents preview"));
  assert.ok(setup.includes("Response subagent / Response custom agent"));
  assert.ok(setup.includes("payment-failure-handler"));
  assert.ok(setup.includes("Custom Agent 담당 지정이 필요"));
  assert.ok(setup.includes("새 Custom Agent를 매번 만들 필요는 없습니다"));
  assert.ok(setup.includes("기존 Custom Agent가 있으면 재사용"));
  assert.ok(setup.includes("Built-in Tools / Custom Tools"));
  assert.ok(setup.includes("기본 상속 유지"));
  assert.ok(setup.includes("기본 Agent의 global tools를 상속"));
  assert.ok(setup.includes("특정 도구를 선택하면 상속 목록을 대체"));
  assert.ok(setup.includes("도구 상속과 Azure 접근 권한은 별개"));
  const instructions = setup.match(/<pre class="prompt" id="response-handler-instructions"><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
  assert.ok(instructions?.includes("원인과 서비스에 미치는 영향 범위"));
});

test("Lab 3 focuses on alert routing and keeps recovery and shutdown after the investigation", () => {
  const lab = html.split('<section id="lab3">')[1]?.split("</section>")[0];
  assert.ok(lab);
  assert.ok(!/HTTP Trigger|payment-manual-trigger|trigger-payload|TRIGGER_URL|동적|monitoring\.sh.*dynamic/.test(lab));
  const cleanup = lab.split('<h3 id="lab3-cleanup">')[1];
  assert.ok(cleanup, "Lab 3 must retain a final cleanup section");
  for (const text of ['bash scripts/scenario.sh "$RG" "$CLUSTER" healthy',
    "kubectl -n payments port-forward service/payment-api 8080:8080",
    'node scripts/traffic.mjs "$APP_URL" 20 healthy', "Resolved",
    "payment-failure-review", "<strong>Off</strong>", "--set properties.enabled=false"]) {
    assert.ok(cleanup.includes(text), `Missing recovery/shutdown step: ${text}`);
  }
  assert.ok(cleanup.indexOf('scenario.sh "$RG" "$CLUSTER" healthy') < cleanup.indexOf("--set properties.enabled=false"),
    "The alert must be disabled only after service recovery");
  assert.ok(lab.includes('cleanup: 실습 경고 Disabled / payment-failure-review Off'));
  assert.ok(html.includes('https://learn.microsoft.com/en-us/azure/sre-agent/http-triggers'));
  assert.ok(html.includes('https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-dynamic-thresholds'),
    "Concept references should remain outside the removed Lab 3 exercises");
});

test("Custom Agent instruction examples meet the 50-character minimum without diagnostic coaching", () => {
  for (const id of ["response-handler-instructions", "payment-specialist-instructions"]) {
    const instructions = html.match(new RegExp(`<pre class="prompt" id="${id}"><code>([\\s\\S]*?)</code></pre>`))?.[1];
    assert.ok(instructions, `Missing Custom Agent instructions: ${id}`);
    assert.ok([...instructions.replace(/\s/g, "")].length >= 50,
      `${id} must meet the minimum even without counting spaces`);
    assert.ok(!/쿼리|로그|UTC|SHA|CLUSTER_ID|APP_INSIGHTS|PBKDF2|SIGNATURE_ITERATIONS|리소스는 변경하지/.test(instructions),
      "Instructions must define the role and purpose, not prescribe investigation steps");
  }
  const incident = html.split('<section id="lab2">')[1]?.match(/<pre class="prompt"><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
  assert.equal(incident, "카드 결제가 느리다는 보고가 있어. 원인과 영향 범위를 조사해 줘.",
    "A Custom Agent field minimum must not lengthen ordinary incident chat inputs");
});

test("Lab 4 briefly introduces connector checks without unrelated setup references", () => {
  const lab = html.split('<section id="lab4">')[1]?.split("<h3>4-2.")[0];
  assert.ok(lab);
  assert.ok(lab.includes("<p>커넥터 목록과 연결 상태를 확인합니다.</p>"));
  assert.ok(!/GitHub|href="#lab7"|href="#lab9"/.test(lab));
  assert.ok(lab.includes('<a href="#workload-logs-setup">'));
  assert.ok(lab.includes("law-aks-payment-kch01x7"));
  assert.ok(lab.includes("기존 상속을 유지"));
  assert.ok(!lab.includes("Agent → Builder → Tools / Global tools"),
    "Global tool management must not point to the Custom Agent builder");
  assert.ok(lab.includes('<span class="path">Agent → Capabilities → Tools</span>'));
  const prompt = lab.match(/<pre class="prompt"><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
  assert.equal(prompt, "payment service의 현재 상태를 확인해 줘.");
  assert.ok(!lab.includes("기본 실습에서는 다음 Lab 7의 GitHub 연결을 사용합니다"));
  assert.ok(!lab.includes("특정 파일/대시보드 조회를 요청"));
});

test("Lab 4 uses the native Grafana connector and distinct panel query formatting", () => {
  const lab = html.split('<section id="lab4">')[1]?.split("</section>")[0];
  const connector = lab?.match(/<li id="grafana-native-connector">([\s\S]*?)<\/li>/)?.[1];
  assert.ok(connector);
  assert.ok(connector.includes('<table id="grafana-connector-values">'));
  for (const text of ["Azure Managed Grafana", "payment-grafana", "rg-payment-grafana-kch01x7",
    "amg-sre-kch01x7", "Viewer (read-only)", "검토 + 연결 테스트", "도구 선택"]) {
    assert.ok(connector.includes(text), `Missing native connector setup: ${text}`);
  }
  assert.ok(!/Streamable-HTTP|\/api\/azure-mcp|Bearer/.test(connector));
  assert.ok(!lab.includes("Add service account"));
  assert.ok(!lab.includes("payment-mcp-kch01x7"));
  assert.ok(lab.includes("쿼리 편집기의 Format as를 Time series"));
  assert.ok(lab.includes("<strong>같은 대시보드</strong>"));
  const template = readFileSync(new URL("../../infra/grafana.bicep", import.meta.url), "utf8");
  assert.ok(template.includes("apiKey: 'Disabled'"));
});

test("Lab 4 omits the optional missing-resource exercise and retains connection verification", () => {
  const lab = html.split('<section id="lab4">')[1]?.split("</section>")[0];
  assert.ok(lab);
  assert.ok(!/4-3\.|누락\/접근 실패를 의도적으로 시험|존재하지 않는 테스트 dashboard|잘못된 UID|실패도 결과물/.test(lab));
  assert.ok(lab.includes("4-1. 연결과 도구 선택을 따로 확인"));
  assert.ok(lab.includes("4-2. Azure Managed Grafana 만들기"));
  assert.ok(lab.includes('id="output-lab4"'));
  assert.ok(lab.includes("실제 data source 조회 결과와 일치"));
  assert.ok(lab.includes('data-check="lab4">커넥터 연결 상태와 실제 데이터 조회를 확인했다.'));
});

test("global tool policies and Custom Agent overrides retain their distinct navigation", () => {
  const policies = html.split("<h3>9-2.")[1]?.split("<h3>9-3.")[0];
  assert.ok(policies?.includes('<span class="path">Agent → Settings → Permissions</span>'));
  assert.ok(policies.includes("Capabilities → Tools"));
  assert.ok(!html.includes("Agent → Builder → Tools"),
    "Neither global tool lists nor global access policies are in Builder");
  assert.ok(html.includes("Agent → Builder → Agent Canvas → Create → Custom Agent"),
    "Custom Agent creation must remain on Agent Canvas");
});

test("Skill setup edits the default file and tests selection without naming the Skill in chat", () => {
  const skill = html.split("<h3>6-1. Skill 만들기</h3>")[1]?.split("<h3>6-2.")[0];
  assert.ok(skill);
  for (const text of ["SKILL.md (기본값)", "오른쪽 편집기", "# Payment investigation",
    "같은 파일을 추가로 업로드하지 않습니다", "이번 실습에는 별도로 추가하지 않습니다",
    "RunAzCliReadCommands", "Skill을 저장"]) {
    assert.ok(skill.includes(text), `Missing Skill editor instruction: ${text}`);
  }
  assert.ok(!skill.includes("supporting file로 업로드"));
  assert.ok(!/files:\s*\n\s*-\s*SKILL\.md/.test(skill));
  const prompt = skill.match(/<pre class="prompt"><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
  assert.equal(prompt, "카드 결제가 느리다는 보고가 있어. 원인과 영향 범위를 조사해 줘.");
  assert.ok(skill.includes("Skill 이름이나 사용 지시는 넣지 않습니다"));
  assert.ok(skill.includes("필요한 Skill을 스스로 선택·로드"));
  assert.ok(!skill.includes("payment-investigation Skill로 조사해 줘"));
  const sample = readFileSync(new URL("../../operations/payment-investigation/SKILL.md", import.meta.url), "utf8");
  assert.ok(sample.includes("# Payment investigation"));
  assert.ok(sample.includes("Output:"));
});

test("Lab 6 Python tools are optional with a skippable dependent PostToolUse exercise", () => {
  const lab = html.split('<section id="lab6">')[1]?.split("</section>")[0];
  assert.ok(lab);
  assert.ok(lab.includes("6-3. Python 도구 만들기와 입력 계약 검증 — 선택 실습"));
  assert.ok(lab.includes("6-4. Pod 상태를 해석하는 Python 도구 — 선택 실습"));
  assert.ok(lab.includes("생략하고 Lab 7로 진행해도 됩니다"));
  assert.ok(lab.includes('data-check="lab6">Skill 선택과 전문 Agent 인계를 확인했다.'));
  assert.ok(lab.includes('data-result-json="summary-tool"'),
    "Optional examples and tool instructions should remain available");
  const hook = html.split("<h3>9-4.")[1]?.split("<p class=\"sources\">")[0];
  assert.ok(hook?.includes("도구를 만든 경우에만 진행하는 선택 실습"));
  assert.ok(hook.includes("PostToolUse 실습도 건너뛰고"));
  assert.ok(hook.includes("Stop Hook만 확인·Disable"));
});

test("initial logs setup distinguishes inherited access, workload sources and Agent audit sink", () => {
  const setup = html.split('<h3 id="agent-setup">')[1]?.split("<h3>0-4.")[0];
  for (const text of ["로그 → +", "law-aks-payment-kch01x7", "appi-aks-payment-kch01x7",
    "같은 RG에 있는 LAW와 App Insights는 이 역할을 상속",
    "LAW가 다른 RG에 있으면", "workspace access mode",
    "Agent의 실제 tool result"]) {
    assert.ok(setup?.includes(text), `Missing logs setup distinction: ${text}`);
  }
  assert.ok(setup.includes("API key가 필요하다고 임의로 가정"));
  assert.ok(setup.includes("로그 ‘권장’ 표시"));
  assert.ok(setup.includes("로그 카드도 권한을 할당합니다"));
  assert.ok(setup.includes("Log Analytics Reader/Monitoring Reader 자동 할당"));
  assert.ok(setup.includes("Configure logging provider"));
  assert.ok(setup.includes("Add connector"));
  const queryPrompt = setup.match(/<pre class="prompt"><code>리소스 변경 없이 다음 원본을 실제 조회해 줘\.([\s\S]*?)<\/code><\/pre>/)?.[1];
  assert.ok(queryPrompt);
  assert.ok(!queryPrompt.includes("Agent 자체 감사 데이터"));
  assert.ok(!queryPrompt.includes("정상 서비스로 표현하지"));
});

test("reference blocks start with a label and the initial resource prompt uses its RG instead of cluster ID", () => {
  const references = [...html.matchAll(/<p class="sources">([\s\S]*?)<\/p>/g)];
  assert.ok(references.length >= 105);
  assert.ok(references.every(([, contents]) => contents.startsWith("참고 문서: ")));
  const prompt = html.match(/<pre class="prompt"><code>대상 리소스 그룹: rg-payment-kch01x7\.([\s\S]*?)<\/code><\/pre>/)?.[1];
  assert.ok(prompt, "Initial resource query requires the explicit example RG");
  assert.ok(!prompt.includes("CLUSTER_ID"));
  assert.ok(!prompt.includes("&lt;RG&gt;"));
  assert.ok(prompt.includes("이 그룹의 AKS"));
});

test("AKS access instructions check automatic roles before presenting optional grants", () => {
  assert.ok(html.includes("기본 흐름은 권한 추가가 아니라 자동 할당 확인입니다"));
  const exception = html.match(/<details id="aks-missing-read-roles">([\s\S]*?)<\/details>/);
  assert.ok(exception, "Manual role grants belong in a collapsed exception section");
  assert.ok(exception[1].includes("az role assignment create"));
  const normalFlow = html.split('<h3>0-4. 자동 할당된 AKS 조회 권한 확인</h3>')[1]?.split('<details id="aks-missing-read-roles">')[0];
  assert.ok(normalFlow?.includes("az role assignment list"));
  assert.ok(!normalFlow.includes("az role assignment create"));
  assert.ok(normalFlow.includes("--include-inherited"));
  assert.ok(!html.includes("아직 Kubernetes data-plane 권한을 추가하기 전이면"));
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
