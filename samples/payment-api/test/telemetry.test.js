"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const https = require("node:https");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, rmdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { gunzipSync } = require("node:zlib");
const { createProvider } = require("../src/provider");

test("real SDK exports request, dependency and exception envelopes to a local collector", { timeout: 45000 }, async (t) => {
  const envelopes = [];
  const diagnostics = [];
  const certDir = mkdtempSync(path.join(tmpdir(), "sre-sdk-test-"));
  const keyFile = path.join(certDir, "key.pem");
  const certFile = path.join(certDir, "cert.pem");
  t.after(() => {
    rmSync(keyFile, { force: true });
    rmSync(certFile, { force: true });
    rmdirSync(certDir);
  });
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyFile, "-out", certFile, "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  const collector = https.createServer({
    key: readFileSync(keyFile), cert: readFileSync(certFile)
  }, (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const text = (req.headers["content-encoding"] === "gzip" ? gunzipSync(buffer) : buffer).toString();
      const items = text.startsWith("[") ? JSON.parse(text) : text.trim().split("\n").map(JSON.parse);
      envelopes.push(...items);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ itemsReceived: items.length, itemsAccepted: items.length, errors: [] }));
    });
  });
  await new Promise((resolve) => collector.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => collector.close(resolve)));
  const provider = createProvider({ signatureIterations: 60000 });
  await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { provider.close(resolve); provider.closeAllConnections(); }));
  for (const scenario of ["healthy", "payment-exception"]) {
    let output = "";
    let stderr = "";
    const child = spawn(process.execPath, [path.resolve(__dirname, "../src/server.js")], {
      env: {
        ...process.env,
        PORT: "0",
        CARD_MERCHANT_ACCOUNT: scenario === "healthy" ? "merchant-card" : "",
        PAYMENT_PROVIDER_URL: `http://127.0.0.1:${provider.address().port}`,
        SOURCE_COMMIT: "sdk-export-test",
        APPLICATIONINSIGHTS_STATSBEAT_DISABLED: "true",
        NODE_EXTRA_CA_CERTS: certFile,
        APPLICATIONINSIGHTS_CONNECTION_STRING:
          `InstrumentationKey=00000000-0000-0000-0000-000000000001;IngestionEndpoint=https://127.0.0.1:${collector.address().port}`
      }
    });
    t.after(() => { if (child.exitCode === null) child.kill("SIGTERM"); });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const exit = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`SDK server startup timeout: ${stderr}`)), 15000);
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`SDK server exited ${code}: ${stderr}`));
      });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const line = output.split("\n").find((entry) => entry.startsWith('{"event":"server_started"'));
        if (line) { clearTimeout(timeout); resolve(JSON.parse(line).port); }
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}/pay?method=card`);
    await response.json();
    assert.equal(response.status, scenario === "healthy" ? 200 : 500);
    child.kill("SIGTERM");
    assert.equal(await exit, 0, stderr);
    diagnostics.push(stderr + output);
  }
  for (const type of ["RequestData", "RemoteDependencyData", "ExceptionData"]) {
    assert.ok(envelopes.some((item) => item.data.baseType === type),
      `Missing ${type}; exported types=${envelopes.map((item) => item.data.baseType)}; ${diagnostics.join("\n")}`);
  }
  assert.equal(envelopes.filter((item) => item.data.baseType === "RequestData").length, 2);
  assert.equal(envelopes.filter((item) => item.data.baseType === "RemoteDependencyData").length, 1);
  assert.equal(envelopes.filter((item) => item.data.baseType === "ExceptionData").length, 1);
  const request = envelopes.find((item) => item.data.baseType === "RequestData" && item.data.baseData.name === "GET /pay");
  assert.equal(request.data.baseData.properties.paymentMethod, "card");
  assert.equal(request.data.baseData.properties.sourceCommit, "sdk-export-test");
  assert.match(request.data.baseData.properties.traceId, /^[0-9a-f]{32}$/);
  assert.equal(request.tags["ai.cloud.role"], "payment-api");
  assert.ok(!/workshop|scenario|simulation/i.test(JSON.stringify(envelopes)));
});
