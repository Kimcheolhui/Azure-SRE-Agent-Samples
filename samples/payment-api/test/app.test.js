"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { createApp } = require("../src/app");
const { loadConfig } = require("../src/config");

async function fixture(t, scenario) {
  const events = { requests: [], dependencies: [], exceptions: [] };
  const telemetry = {
    request: (item) => events.requests.push(item),
    dependency: (item) => events.dependencies.push(item),
    exception: (item) => events.exceptions.push(item)
  };
  const server = createApp({ ...loadConfig({ PORT: "0" }), scenario, commit: "abc1234" }, telemetry);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeIdleConnections();
  }));
  return { events, base: `http://127.0.0.1:${server.address().port}` };
}

test("healthy card and bank payments emit request and dependency evidence", async (t) => {
  const { base, events } = await fixture(t, "healthy");
  for (const method of ["card", "bank"]) {
    const response = await fetch(`${base}/pay?method=${method}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.paid, true);
    assert.equal(body.sourceCommit, "abc1234");
    assert.equal(body.podName, "local");
  }
  assert.equal(events.dependencies.length, 2);
  assert.ok(events.dependencies.every((item) => item.success));
  assert.equal(events.requests.filter((item) => item.name === "GET /pay").length, 2);
});

test("dependency-slow measurably delays only card payments", async (t) => {
  const { base, events } = await fixture(t, "dependency-slow");
  const started = performance.now();
  const card = await fetch(`${base}/pay?method=card`);
  await card.json();
  assert.equal(card.status, 200);
  assert.ok(performance.now() - started >= 1700);
  const bankStarted = performance.now();
  const bank = await fetch(`${base}/pay?method=bank`);
  await bank.json();
  assert.equal(bank.status, 200);
  assert.ok(performance.now() - bankStarted < 1000);
  assert.ok(events.dependencies[0].duration >= 1700);
  assert.ok(events.dependencies[1].duration < 1000);
});

test("payment-exception records evidence while bank remains healthy", async (t) => {
  const { base, events } = await fixture(t, "payment-exception");
  assert.equal((await fetch(`${base}/pay?method=card`)).status, 500);
  assert.equal((await fetch(`${base}/pay?method=bank`)).status, 200);
  assert.equal(events.exceptions.length, 1);
  assert.match(events.exceptions[0].exception.message, /WORKSHOP_PAYMENT_CONFIG_ERROR/);
  assert.equal(events.dependencies.length, 1);
});

test("unavailable affects health and both payment methods", async (t) => {
  const { base } = await fixture(t, "unavailable");
  for (const path of ["/health", "/pay?method=card", "/pay?method=bank"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 503);
  }
  assert.equal((await fetch(`${base}/version`)).status, 200);
});

test("Pod readiness identity is separate from injected business unavailability", async (t) => {
  const { base } = await fixture(t, "unavailable");
  const response = await fetch(`${base}/version`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.namespace, "local");
  assert.equal((await fetch(`${base}/health`)).status, 503);
});

test("invalid input is explicit and HTTP cannot change fault configuration", async (t) => {
  const { base } = await fixture(t, "healthy");
  for (const query of ["method=crypto", "amount=-1", "amount=NaN", "amount=1000001"]) {
    assert.equal((await fetch(`${base}/pay?${query}`)).status, 400);
  }
  assert.equal((await fetch(`${base}/admin/fault?scenario=unavailable`)).status, 404);
  assert.equal((await fetch(`${base}/pay`, { method: "POST" })).status, 405);
});

test("configuration rejects unknown scenarios and invalid ports", () => {
  assert.throws(() => loadConfig({ SRE_SCENARIO: "typo" }), /Unsupported/);
  assert.throws(() => loadConfig({ PORT: "-1" }), /PORT/);
  assert.equal(loadConfig({}).scenario, "healthy");
});
