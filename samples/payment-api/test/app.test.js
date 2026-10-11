"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers");
const { loadConfig } = require("../src/config");

test("card and bank payments use a separate HTTP provider with neutral evidence", async t => {
  const { base, events } = await fixture(t);
  for (const method of ["card", "bank"]) {
    const response = await fetch(`${base}/pay?method=${method}`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.paid, true);
    assert.equal(body.sourceCommit, "abc1234");
    assert.equal(body.podName, "local");
    assert.ok(!/scenario|workshop|simulat|fault/i.test(JSON.stringify(body)));
  }
  assert.equal(events.dependencies.length, 2);
  assert.ok(events.dependencies.every(item => item.success && item.name === "POST /authorize"));
  assert.equal(events.requests.length, 2);
  assert.ok(!/scenario|workshop|simulat|fault/i.test(JSON.stringify(events)));
});

test("provider signature cost measurably delays card, not bank", async t => {
  const { base, events } = await fixture(t, { iterations: 16000000 });
  assert.equal((await fetch(`${base}/pay?method=card`)).status, 200);
  assert.equal((await fetch(`${base}/pay?method=bank`)).status, 200);
  assert.ok(events.dependencies[0].duration >= 1000);
  assert.ok(events.dependencies[1].duration < 1000);
});

test("missing card merchant records a real configuration error, bank still succeeds", async t => {
  const { base, events } = await fixture(t, { cardMerchant: "" });
  assert.equal((await fetch(`${base}/pay?method=card`)).status, 500);
  assert.equal((await fetch(`${base}/pay?method=bank`)).status, 200);
  assert.equal(events.exceptions[0].exception.name, "PaymentConfigurationError");
  assert.match(events.exceptions[0].exception.message, /Merchant account is not configured/);
  assert.equal(events.dependencies.length, 1);
});

test("stopped provider gives actual dependency failure while process health remains available", async t => {
  const { base, events, provider } = await fixture(t);
  await new Promise(resolve => { provider.close(resolve); provider.closeAllConnections(); });
  for (const method of ["card", "bank"]) assert.equal((await fetch(`${base}/pay?method=${method}`)).status, 503);
  for (const path of ["/health", "/version"]) assert.equal((await fetch(`${base}${path}`)).status, 200);
  assert.ok(events.dependencies.every(item => !item.success && item.resultCode === "0"));
});

test("invalid requests are rejected and there is no control endpoint", async t => {
  const { base } = await fixture(t);
  for (const query of ["method=crypto", "amount=-1", "amount=NaN", "amount=1000001"]) {
    assert.equal((await fetch(`${base}/pay?${query}`)).status, 400);
  }
  assert.equal((await fetch(`${base}/admin/fault`)).status, 404);
  assert.equal((await fetch(`${base}/pay`, { method: "POST" })).status, 405);
});

test("startup rejects invalid provider configuration without accepting scenario switches", () => {
  assert.throws(() => loadConfig({ PORT: "-1" }), /PORT/);
  assert.throws(() => loadConfig({ PAYMENT_PROVIDER_URL: "file:///etc/passwd" }), /PAYMENT_PROVIDER_URL/);
  assert.throws(() => loadConfig({ PROVIDER_REQUEST_TIMEOUT_MS: "0" }), /TIMEOUT/);
  assert.ok(!("scenario" in loadConfig({})));
});
