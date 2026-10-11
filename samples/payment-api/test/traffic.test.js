"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const { createApp } = require("../src/app");
const exec = promisify(execFile);
const traffic = path.resolve(__dirname, "../../../scripts/traffic.mjs");

for (const scenario of ["healthy", "dependency-slow", "payment-exception", "unavailable"]) {
  test(`traffic CLI verifies actual HTTP output for ${scenario}`, async (t) => {
    const server = createApp({ scenario, commit: "cli-test" }, {
      request() {}, dependency() {}, exception() {}
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const { stdout } = await exec(process.execPath, [traffic, base, "2", scenario]);
    const rows = stdout.trim().split("\n").map((line) => JSON.parse(line));
    const summaries = rows.filter((row) => row.summary);
    assert.equal(summaries.length, 2);
    assert.ok(summaries.every((row) => row.count === 2));
    assert.ok(rows.filter((row) => row.round).every((row) => row.sourceCommit === "cli-test"));
    if (scenario === "healthy") {
      assert.ok(summaries.every((row) => row.failureRate === 0 && row.p95Ms <= 1000));
    }
    if (scenario === "dependency-slow") {
      assert.ok(summaries.find((row) => row.summary === "card").p95Ms >= 1700);
    }
    if (scenario === "unavailable") {
      assert.ok(summaries.every((row) => row.failureRate === 1));
      await assert.rejects(exec(process.execPath, [traffic, base, "1", "healthy"]));
    }
  });
}

test("traffic CLI rejects invalid round count and unavailable endpoint", async () => {
  await assert.rejects(exec(process.execPath, [traffic, "http://127.0.0.1", "0"]));
  await assert.rejects(exec(process.execPath, [traffic, "http://127.0.0.1:1", "1", "healthy"]));
});
