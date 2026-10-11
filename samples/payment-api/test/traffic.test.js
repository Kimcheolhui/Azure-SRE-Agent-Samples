"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const { fixture } = require("./helpers");
const exec = promisify(execFile);
const traffic = path.resolve(__dirname, "../../../scripts/traffic.mjs");

for (const expected of ["healthy", "dependency-slow", "payment-exception", "unavailable"]) {
  test(`learner traffic verifies ${expected} without expecting an answer label from the workload`, async t => {
    const { base, provider } = await fixture(t, {
      iterations: expected === "dependency-slow" ? 16000000 : 60000,
      cardMerchant: expected === "payment-exception" ? "" : undefined
    });
    if (expected === "unavailable") {
      await new Promise(resolve => { provider.close(resolve); provider.closeAllConnections(); });
    }
    const { stdout } = await exec(process.execPath, [traffic, base, "2", expected]);
    const rows = stdout.trim().split("\n").map(JSON.parse);
    assert.equal(rows.filter(row => row.summary).length, 2);
    assert.ok(rows.every(row => !("scenario" in row)));
    if (expected === "unavailable") {
      await assert.rejects(exec(process.execPath, [traffic, base, "1", "healthy"]));
    }
  });
}
test("traffic rejects invalid count and unavailable endpoint", async () => {
  await assert.rejects(exec(process.execPath, [traffic, "http://127.0.0.1", "0"]));
  await assert.rejects(exec(process.execPath, [traffic, "http://127.0.0.1:1", "1", "healthy"]));
});
