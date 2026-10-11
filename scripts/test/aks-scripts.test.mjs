import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = resolve(new URL("../..", import.meta.url).pathname);

async function mocks(t, script, args, mode = "normal") {
  const dir = mkdtempSync(join(tmpdir(), "aks-script-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, "calls.jsonl");
  const state = join(dir, "state.json");
  const image = `acrsretest.azurecr.io/payment-api@sha256:${"a".repeat(64)}`;
  writeFileSync(state, JSON.stringify({
    metadata: { generation: 2, labels: { workshop: "azure-sre-agent" },
      annotations: { "workshop.azure-sre-agent/healthy-image": image } },
    spec: { template: { spec: { containers: [{ name: "payment-api", image,
      env: [{ name: "SRE_SCENARIO", value: "healthy" }] }] } } },
    status: { observedGeneration: 2, updatedReplicas: 2, availableReplicas: 2 }
  }));
  const program = `#!${process.execPath}
const fs=require("node:fs"),path=require("node:path");
const tool=path.basename(process.argv[1]),args=process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG,JSON.stringify({tool,args})+"\\n");
const state=JSON.parse(fs.readFileSync(process.env.MOCK_STATE,"utf8"));
if(tool==="kubelogin")process.exit(0);
if(tool==="git"){
 if(args.includes("rev-parse"))console.log("b".repeat(40));
 process.exit(0);
}
if(tool==="az"){
 if(args[0]==="group")console.log(process.env.MOCK_MODE==="bad-tag"?"not-workshop":"azure-sre-agent");
 if(args[0]==="ad")console.log("00000000-0000-0000-0000-000000000002");
 if(args[0]==="acr"&&args[1]==="show")console.log("acrsretest.azurecr.io");
 if(args[0]==="acr"&&args[1]==="repository")console.log(args[2]==="show-tags"?"[]":"sha256:"+"a".repeat(64));
 if(args[0]==="resource")console.log("InstrumentationKey=00000000-0000-0000-0000-000000000003");
 if(args[0]==="aks"&&args[1]==="get-credentials"){
   fs.writeFileSync(args[args.indexOf("--file")+1],"mock");
 }
 process.exit(0);
}
if(args.includes("apply")){
 let data="";process.stdin.on("data",chunk=>data+=chunk);process.stdin.on("end",()=>{
  fs.appendFileSync(process.env.MOCK_LOG,JSON.stringify({tool:"apply-input",text:data})+"\\n");
  console.log("applied");});
}
if(args.includes("create")&&args.includes("namespace"))console.log('{"apiVersion":"v1","kind":"Namespace","metadata":{"name":"sre-workshop"}}');
if(args.includes("set")&&args.includes("env")){
 state.spec.template.spec.containers[0].env[0].value=args.find(a=>a.startsWith("SRE_SCENARIO=")).split("=")[1];
 fs.writeFileSync(process.env.MOCK_STATE,JSON.stringify(state));
}
if(args.includes("get")&&args.includes("deployment"))console.log(JSON.stringify(state));
if(args.includes("get")&&args.includes("pods")&&args.includes("json")){
 console.log(JSON.stringify({kind:"PodList",items:[{status:{containerStatuses:[{state:{waiting:{reason:"ImagePullBackOff"}}}]}}]}));
}
`;
  for (const tool of ["az", "kubectl", "kubelogin", "git"]) {
    writeFileSync(join(dir, tool), program);
    chmodSync(join(dir, tool), 0o755);
  }
  const result = await exec("bash", [join(root, "scripts", script), ...args], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MOCK_LOG: log,
      MOCK_STATE: state, MOCK_MODE: mode }, timeout: 10000
  });
  return { result, calls: readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) };
}

test("scenario uses isolated AKS credentials and changes only the named Deployment", async t => {
  const { calls, result } = await mocks(t, "scenario.sh", ["rg-sre-workshop-test", "aks-sre-test", "payment-exception"]);
  assert.ok(result.stdout.includes("2 updated/available replicas verified"));
  const writes = calls.filter(call => call.tool === "kubectl" && call.args.includes("set"));
  assert.equal(writes.length, 2);
  assert.ok(writes.every(call => call.args.includes("deployment/payment-api")));
  assert.ok(calls.some(call => call.tool === "az" && call.args.includes("--file")));
  assert.ok(!calls.some(call => call.args.includes("--admin") || call.args.includes("webapp")));
});

test("image failure verifies waiting reason rather than falsely reporting service outage", async t => {
  const { result, calls } = await mocks(t, "scenario.sh",
    ["rg-sre-workshop-test", "aks-sre-test", "image-pull-failure"]);
  assert.ok(result.stdout.includes("old healthy Pods can still serve"));
  assert.ok(calls.some(call => call.args.includes("payment-api=acrsretest.azurecr.io/payment-api:workshop-missing-tag")));
  assert.ok(!calls.some(call => call.args.includes("SRE_SCENARIO=image-pull-failure")));
});

test("scenario refuses a non-workshop target and unknown scenario", async t => {
  await assert.rejects(exec("bash", [join(root, "scripts/scenario.sh"), "production", "aks-prod", "healthy"]));
  await assert.rejects(mocks(t, "scenario.sh", ["rg-sre-workshop-test", "aks-sre-test", "typo"]));
  await assert.rejects(mocks(t, "scenario.sh", ["rg-sre-workshop-test", "aks-sre-test", "healthy"], "bad-tag"));
});

test("Kubernetes manifest uses digest substitution, safe probes and isolated deployment", () => {
  const yaml = readFileSync(join(root, "k8s/workload.yaml"), "utf8");
  assert.ok(yaml.includes("replicas: 2"));
  assert.ok(yaml.includes("maxUnavailable: 0"));
  assert.equal([...yaml.matchAll(/path: \/version/g)].length, 3);
  assert.ok(!yaml.includes("path: /health"));
  assert.ok(yaml.includes("type: ClusterIP"));
  assert.ok(yaml.includes("runAsNonRoot: true"));
  assert.ok(yaml.includes("secretKeyRef:"));
  assert.ok(!yaml.includes("SOURCE_COMMIT"));
  const deployment = readFileSync(join(root, "scripts/deploy.sh"), "utf8");
  assert.ok(deployment.includes("--platform linux/amd64"));
  assert.ok(deployment.includes("payment-api@$DIGEST"));
  assert.ok(deployment.includes("kubectl apply --server-side"));
});

test("deployment builds remotely, pins digest and feeds Secret through stdin", async t => {
  const { calls, result } = await mocks(t, "deploy.sh",
    ["rg-sre-workshop-test", "aks-sre-test", "acrsretest", "eastus2"]);
  assert.ok(result.stdout.includes("Image deployed: acrsretest.azurecr.io/payment-api@sha256:"));
  assert.ok(calls.some(c => c.tool === "az" && c.args.includes("linux/amd64") && c.args.includes("SOURCE_COMMIT="+"b".repeat(40))));
  const manifests = calls.filter(c => c.tool === "apply-input").map(c => c.text);
  const secret = manifests.map(text => text.trim().startsWith("{") ? JSON.parse(text) : null)
    .find(d => d?.kind === "Secret");
  assert.ok(secret, `Secret was not passed to apply: ${JSON.stringify(manifests)}`);
  assert.equal(secret.metadata.namespace, "sre-workshop");
  assert.ok(secret.data["connection-string"]);
  assert.ok(manifests.some(text => text.includes("acrsretest.azurecr.io/payment-api@sha256:")));
  assert.ok(!calls.filter(c => c.args).some(c => c.args.some(a => a.includes("InstrumentationKey="))));
});

test("infrastructure and workshop use Standard tiers and two adequately sized nodes", () => {
  const infrastructure = readFileSync(join(root, "infra/main.bicep"), "utf8");
  const workshop = readFileSync(join(root, "docs/workshop.html"), "utf8");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.ok(infrastructure.includes("sku: { name: 'Base', tier: 'Standard' }"));
  assert.ok(infrastructure.includes("sku: { name: 'Standard' }"));
  assert.ok(infrastructure.includes("param nodeVmSize string = 'Standard_D4s_v5'"));
  assert.ok(infrastructure.includes("count: 2"));
  assert.ok(workshop.includes("Standard tier · D4s_v5×2"));
  assert.ok(readme.includes("ACR Standard"));
  for (const content of [infrastructure, workshop, readme]) {
    assert.ok(!/tier: 'Free'|AKS Free|ACR Basic|Standard_D2s_v5|D2s_v5×1/.test(content));
  }
});
