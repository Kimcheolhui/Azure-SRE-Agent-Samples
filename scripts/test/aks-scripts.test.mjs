import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync, readdirSync } from "node:fs";
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
  const image = `acrpaymenttest.azurecr.io/payment-api@sha256:${"a".repeat(64)}`;
  writeFileSync(state, JSON.stringify({
    metadata: { generation: 2, labels: { application: "payments" } },
    spec: { template: { spec: { containers: [{ name: "payment-api", image,
      env: [{ name: "CARD_MERCHANT_ACCOUNT", value: "merchant-card" }] }] } } },
    status: { observedGeneration: 2, updatedReplicas: 2, availableReplicas: 2 }
  }));
  writeFileSync(join(dir, `release-${args[1]}.json`), JSON.stringify({
    resourceGroup: args[0], cluster: args[1], image
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
 if(args[0]==="group")console.log(process.env.MOCK_MODE==="bad-tag"?"unmanaged":"payments");
 if(args[0]==="ad")console.log("00000000-0000-0000-0000-000000000002");
 if(args[0]==="acr"&&args[1]==="show")console.log("acrpaymenttest.azurecr.io");
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
if(args.includes("create")&&args.includes("namespace"))console.log('{"apiVersion":"v1","kind":"Namespace","metadata":{"name":"payments"}}');
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
      MOCK_STATE: state, MOCK_MODE: mode, PAYMENT_RELEASE_DIR: dir }, timeout: 10000
  });
  return { result, calls: readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) };
}

test("learner control changes real merchant configuration without exposing scenario flags", async t => {
  const { calls, result } = await mocks(t, "scenario.sh", ["rg-payment-test", "aks-payment-test", "payment-exception"]);
  assert.ok(result.stdout.includes("Configuration applied"));
  const writes = calls.filter(call => call.tool === "kubectl" && call.args.includes("set"));
  assert.equal(writes.length, 1);
  assert.ok(writes.every(call => call.args.includes("deployment/payment-api")));
  assert.ok(calls.some(call => call.tool === "az" && call.args.includes("--file")));
  assert.ok(!calls.some(call => call.args.includes("--admin") || call.args.includes("webapp")));
  assert.ok(!JSON.stringify(calls).includes("SRE_SCENARIO"));
  assert.ok(!calls.some(call => call.args.includes("annotate")));
});

test("image failure verifies waiting reason rather than falsely reporting service outage", async t => {
  const { result, calls } = await mocks(t, "scenario.sh",
    ["rg-payment-test", "aks-payment-test", "image-pull-failure"]);
  assert.ok(result.stdout.includes("previous Pods still serve"));
  assert.ok(calls.some(call => call.args.some(argument =>
    /^payment-api=acrpaymenttest\.azurecr\.io\/payment-api:[a-f0-9]{40}$/.test(argument))));
  assert.ok(!JSON.stringify(calls).includes("workshop-missing-tag"));
});

test("scenario refuses a non-workshop target and unknown scenario", async t => {
  await assert.rejects(exec("bash", [join(root, "scripts/scenario.sh"), "production", "aks-prod", "healthy"]));
  await assert.rejects(mocks(t, "scenario.sh", ["rg-payment-test", "aks-payment-test", "typo"]));
  await assert.rejects(mocks(t, "scenario.sh", ["rg-payment-test", "aks-payment-test", "healthy"], "bad-tag"));
});

test("Kubernetes manifest uses digest substitution, safe probes and isolated deployment", () => {
  const yaml = readFileSync(join(root, "k8s/workload.yaml"), "utf8");
  assert.ok(yaml.includes("replicas: 2"));
  assert.ok(yaml.includes("maxUnavailable: 0"));
  assert.equal([...yaml.matchAll(/path: \/version/g)].length, 3);
  assert.ok(yaml.includes("payment-provider"));
  assert.ok(!/workshop|SRE_SCENARIO|simulation|stub|healthy-image/.test(yaml));
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
    ["rg-payment-test", "aks-payment-test", "acrpaymenttest", "eastus2"]);
  assert.ok(result.stdout.includes("Image deployed: acrpaymenttest.azurecr.io/payment-api@sha256:"));
  assert.ok(calls.some(c => c.tool === "az" && c.args.includes("linux/amd64") && c.args.includes("SOURCE_COMMIT="+"b".repeat(40))));
  const manifests = calls.filter(c => c.tool === "apply-input").map(c => c.text);
  const secret = manifests.map(text => text.trim().startsWith("{") ? JSON.parse(text) : null)
    .find(d => d?.kind === "Secret");
  assert.ok(secret, `Secret was not passed to apply: ${JSON.stringify(manifests)}`);
  assert.equal(secret.metadata.namespace, "payments");
  assert.ok(secret.data["connection-string"]);
  assert.ok(manifests.some(text => text.includes("acrpaymenttest.azurecr.io/payment-api@sha256:")));
  assert.ok(!calls.filter(c => c.args).some(c => c.args.some(a => a.includes("InstrumentationKey="))));
});

test("slow and unavailable controls use actual provider cost and replica count", async t => {
  const slow = await mocks(t, "scenario.sh", ["rg-payment-test", "aks-payment-test", "dependency-slow"]);
  assert.ok(slow.calls.some(c => c.args?.includes("SIGNATURE_ITERATIONS=16000000")));
  const unavailable = await mocks(t, "scenario.sh", ["rg-payment-test", "aks-payment-test", "unavailable"]);
  assert.ok(unavailable.calls.some(c => c.args?.includes("--replicas=0") && c.args.includes("deployment/payment-provider")));
});

test("private infrastructure bootstrap stops before Kubernetes access and image build", async t => {
  const { calls, result } = await mocks(t, "deploy.sh",
    ["rg-payment-test", "aks-payment-test", "acrpaymenttest", "eastus2", "private", "--infra-only"]);
  assert.ok(result.stdout.includes("no image build, credentials or workload deployment"));
  assert.ok(calls.some(call => call.tool === "az" && call.args.includes("privateCluster=true")));
  assert.ok(!calls.some(call => call.tool === "az" && call.args.includes("get-credentials")));
  assert.ok(!calls.some(call => call.tool === "az" && call.args.includes("build")));
  assert.ok(!calls.some(call => call.tool === "kubectl"));
});

test("deployed source and Agent knowledge do not contain intentional-failure labels or branches", () => {
  for (const file of ["src/app.js", "src/config.js", "src/provider.js", "src/provider-server.js",
    "src/server.js", "src/telemetry.js", "package.json"]) {
    const text = readFileSync(join(root, "samples/payment-api", file), "utf8");
    assert.ok(!/scenario|workshop|simulat|fault|inject|stub|setTimeout|delay\(1800/i.test(text), file);
  }
  for (const file of ["k8s/workload.yaml", "infra/main.bicep", "operations/service-context.md",
    "operations/payment-investigation/SKILL.md"]) {
    assert.ok(!/workshop|simulat|SRE_SCENARIO|healthy-image|의도.*장애|장애.*재현/i.test(readFileSync(join(root, file), "utf8")), file);
  }
});

test("exported Agent source excludes control scripts, tests and learner documents", async t => {
  const directory = mkdtempSync(join(tmpdir(), "payment-source-export-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { stdout } = await exec("git", ["-C", root, "rev-parse", "HEAD"]);
  const commit = stdout.trim();
  await exec(process.execPath, [join(root, "scripts/export-agent-source.mjs"), commit], {
    env: { ...process.env, PAYMENT_SOURCE_DIR: directory }
  });
  const output = join(directory, `source-${commit}`);
  assert.deepEqual(readdirSync(output).sort(), ["Dockerfile", "package-lock.json", "package.json", "release.json", "src"]);
  const release = JSON.parse(readFileSync(join(output, "release.json"), "utf8"));
  assert.equal(release.sourceCommit, commit);
  const original = await exec("git", ["-C", root, "show", `${commit}:samples/payment-api/src/app.js`]);
  assert.equal(readFileSync(join(output, "src/app.js"), "utf8"), original.stdout);
  assert.ok(release.files["src/provider.js"]);
  assert.ok(Object.values(release.files).every(hash => /^[a-f0-9]{64}$/.test(hash)));
  await assert.rejects(exec(process.execPath, [join(root, "scripts/export-agent-source.mjs"), "main"],
    { env: { ...process.env, PAYMENT_SOURCE_DIR: directory } }));
});

test("infrastructure and workshop use Standard tiers and three adequately sized nodes", () => {
  const infrastructure = readFileSync(join(root, "infra/main.bicep"), "utf8");
  const workshop = readFileSync(join(root, "docs/workshop.html"), "utf8");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.ok(infrastructure.includes("sku: { name: 'Base', tier: 'Standard' }"));
  assert.ok(infrastructure.includes("sku: { name: 'Standard' }"));
  assert.ok(infrastructure.includes("param nodeVmSize string = 'Standard_D4s_v6'"));
  assert.ok(infrastructure.includes("count: 3"));
  assert.ok(workshop.includes("Standard tier · D4s_v6×3"));
  assert.ok(readme.includes("`Standard_D4s_v6` 노드3대"));
  assert.ok(workshop.includes("합계12 vCPU/48GiB"));
  assert.ok(readme.includes("합계12 vCPU/48GiB"));
  assert.ok(readme.includes("ACR Standard"));
  for (const content of [infrastructure, workshop, readme]) {
    assert.ok(!/tier: 'Free'|AKS Free|ACR Basic|Standard_D[24]s_v5|D[24]s_v5×[13]/.test(content));
  }
});
