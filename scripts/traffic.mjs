import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const [baseArg, countArg = "20", expected] = process.argv.slice(2);
const scenarios = ["healthy", "dependency-slow", "payment-exception", "unavailable"];
if (!baseArg || !Number.isInteger(Number(countArg)) || Number(countArg) < 1 || Number(countArg) > 300 ||
    (expected && !scenarios.includes(expected))) {
  console.error("Usage: node scripts/traffic.mjs <http(s)://host> <1-300 rounds> [expected-scenario]");
  process.exit(2);
}
const base = new URL(baseArg);
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
  throw new Error("Use an HTTP(S) URL without embedded credentials");
}
const samples = [];
let errors = 0;
for (let round = 0; round < Number(countArg); round++) {
  for (const method of ["card", "bank"]) {
    const started = performance.now();
    try {
      const response = await fetch(new URL(`/pay?method=${method}&amount=100`, base), {
        signal: AbortSignal.timeout(10000)
      });
      const body = await response.json();
      const durationMs = Math.round(performance.now() - started);
      samples.push({ method, status: response.status, durationMs });
      console.log(JSON.stringify({ round: round + 1, method, status: response.status, durationMs,
        sourceCommit: body.sourceCommit, scenario: body.scenario, requestId: body.requestId,
        podName: body.podName, namespace: body.namespace }));
      const wantedStatus = expected === "unavailable" ? 503 :
        expected === "payment-exception" && method === "card" ? 500 : 200;
      if (expected && (response.status !== wantedStatus || body.scenario !== expected)) errors++;
      if (!expected && !response.ok) errors++;
    } catch (error) {
      console.error(JSON.stringify({ round: round + 1, method, error: error.message }));
      errors++;
    }
  }
  await delay(250);
}
for (const method of ["card", "bank"]) {
  const rows = samples.filter((row) => row.method === method);
  const times = rows.map((row) => row.durationMs).sort((a, b) => a - b);
  const p95 = times.length ? times[Math.ceil(times.length * 0.95) - 1] : null;
  console.log(JSON.stringify({ summary: method, count: rows.length,
    failureRate: rows.length ? rows.filter((row) => row.status >= 400).length / rows.length : null, p95Ms: p95 }));
  if (expected === "dependency-slow" && method === "card" && (p95 === null || p95 < 1700)) errors++;
  if (expected === "healthy" && (p95 === null || p95 > 1000)) errors++;
}
if (errors) {
  console.error(`Verification failed: ${errors} mismatches, network errors or threshold failures`);
  process.exitCode = 1;
}
