import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(new URL("../..", import.meta.url).pathname);
const read = path => readFileSync(join(root, path), "utf8");

async function run(t, script, args, mode = "existing") {
  const directory = mkdtempSync(join(tmpdir(), "payment-monitoring-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, "calls.jsonl");
  const mock = `#!${process.execPath}
const fs=require("node:fs");
const args=process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG,JSON.stringify(args)+"\\n");
if(args[0]==="group"&&args[1]==="show") console.log(process.env.MOCK_MODE==="bad-tag"?"shared":"payments");
if(args[0]==="group"&&args[1]==="exists") console.log("true");
if(args[0]==="aks") console.log("eastus2");
if(args[0]==="resource"&&args[1]==="list") console.log(process.env.MOCK_MODE==="new"?"":"ag-payments-test");
if(args[0]==="ad") console.log("00000000-0000-0000-0000-000000000002");
`;
  for (const tool of ["az", "kubectl", "kubelogin"]) {
    writeFileSync(join(directory, tool), mock);
    chmodSync(join(directory, tool), 0o755);
  }
  const result = await exec("bash", [join(root, "scripts", script), ...args], {
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, MOCK_LOG: log, MOCK_MODE: mode,
      AGENT_PRINCIPAL: "00000000-0000-0000-0000-000000000001" },
    timeout: 10000,
  });
  return { result, calls: readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) };
}

test("alert deployment preserves existing notification receivers", async t => {
  const { calls, result } = await run(t, "monitoring.sh", ["rg-payment-test", "aks-payment-test", "alerts"]);
  const deployment = calls.find(args => args[0] === "deployment");
  assert.ok(deployment.includes("createActionGroup=false"));
  assert.ok(deployment.includes("alertName=payment-failures-test"));
  assert.ok(deployment.includes("actionGroupName=ag-payments-test"));
  assert.ok(result.stdout.includes("without changing its notification receivers"));
  assert.ok(!calls.some(args => args.includes("delete") || args.includes("get-credentials")));
});

test("new alert groups are notification-free and preview does not deploy", async t => {
  const { calls } = await run(t, "monitoring.sh",
    ["rg-payment-test", "aks-payment-test", "alerts", "--what-if"], "new");
  const deployment = calls.find(args => args[0] === "deployment");
  assert.ok(deployment.includes("what-if"));
  assert.ok(deployment.includes("createActionGroup=true"));
  assert.ok(read("infra/alerts.bicep").includes("emailReceivers: []"));
});

test("monitoring deployment rejects unsafe targets and missing dynamic prerequisites", async t => {
  await assert.rejects(run(t, "monitoring.sh", ["production", "aks-prod", "alerts"]));
  await assert.rejects(run(t, "monitoring.sh", ["rg-payment-test", "aks-payment-test", "alerts"], "bad-tag"));
  await assert.rejects(run(t, "monitoring.sh", ["rg-payment-test", "aks-payment-test", "dynamic"], "new"));
  await assert.rejects(run(t, "monitoring.sh", ["rg-payment-test", "aks-payment-test", "audit", "--unknown"]));
});

test("connection provisioning uses dedicated groups and secret upload never enters a template", async t => {
  const { calls } = await run(t, "provision-connection.sh", ["keyvault", "test", "eastus2"]);
  const deployment = calls.find(args => args[0] === "deployment");
  assert.ok(deployment.includes("rg-payment-keyvault-test"));
  assert.ok(deployment.includes("agentPrincipalId=00000000-0000-0000-0000-000000000001"));
  const vault = read("infra/keyvault.bicep");
  assert.ok(vault.includes("enableRbacAuthorization: true"));
  assert.ok(!vault.includes("Microsoft.KeyVault/vaults/secrets"));
  await assert.rejects(run(t, "provision-connection.sh", ["grafana", "../production", "eastus2"]));
});

test("alert and audit templates use real measurable signals and dedicated tables", () => {
  const alerts = read("infra/alerts.bicep");
  for (const property of ["metricMeasureColumn: 'FailedRequests'", "timeAggregation: 'Maximum'",
    "threshold: 5", "evaluationFrequency: 'PT1M'", "windowSize: 'PT5M'", "autoMitigate: true"]) {
    assert.ok(alerts.includes(property), property);
  }
  assert.ok(read("infra/dynamic.bicep").includes("metricName: 'requests/duration'"));
  assert.ok(read("infra/dynamic.bicep").includes("enabled: false"));
  assert.ok(read("infra/audit.bicep").includes("logAnalyticsDestinationType: 'Dedicated'"));
  assert.ok(read("infra/audit.bicep").includes("category: 'kube-audit-admin'"));
  assert.ok(!alerts.includes("resolveConfiguration"),
    "The service rejects resolveConfiguration together with autoMitigate");
});

test("every Lab 3–13 has an actionable Agent input, and lifecycle commands are concrete", () => {
  const html = read("docs/workshop.html");
  for (let lab = 3; lab <= 13; lab++) {
    const section = html.split(`<section id="lab${lab}">`)[1]?.split("</section>")[0]
      ?.split('<details class="result-example"')[0];
    assert.ok(section?.includes('<pre class="prompt"><code>'), `Missing Agent input for Lab ${lab}`);
  }
  assert.ok(html.includes('bash scripts/monitoring.sh "$RG" "$CLUSTER" alerts'));
  assert.ok(html.includes('bash scripts/monitoring.sh "$RG" "$CLUSTER" audit'));
  assert.ok(html.includes('private --infra-only'));
  assert.ok(html.includes('--recipe minimal'));
  assert.ok(!html.includes("&lt;RECIPE&gt;"));
  for (const command of ["bash bin/export-agent.sh", "bash bin/diff-agent.sh",
    "bash bin/clone-agent.sh", "bash bin/verify-agent.sh"]) assert.ok(html.includes(command));
  assert.ok(html.includes("Title contains는 커넥터 수집 범위를 줄이지 않습니다"));
});
