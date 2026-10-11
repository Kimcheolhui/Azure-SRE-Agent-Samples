"use strict";

const http = require("node:http");
const { randomBytes, randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { setTimeout: delay } = require("node:timers/promises");

function createApp(config, telemetry) {
  const server = http.createServer(async (req, res) => {
    const started = performance.now();
    const requestId = randomUUID();
    const traceId = randomBytes(16).toString("hex");
    const spanId = randomBytes(8).toString("hex");
    const traceparent = `00-${traceId}-${spanId}-01`;
    const url = new URL(req.url, "http://localhost");
    const method = url.searchParams.get("method") || "card";
    const properties = {
      requestId,
      traceId,
      paymentMethod: method,
      scenario: config.scenario,
      sourceCommit: config.commit,
      podName: config.podName || "local",
      namespace: config.namespace || "local"
    };
    let status = 200;
    let body;
    try {
      if (req.method !== "GET") {
        status = 405;
        body = { error: "method_not_allowed" };
      } else if (url.pathname === "/health") {
        status = config.scenario === "unavailable" ? 503 : 200;
        body = { status: status === 200 ? "healthy" : "unavailable" };
      } else if (url.pathname === "/version") {
        body = { sourceCommit: config.commit, scenario: config.scenario };
      } else if (url.pathname === "/provider") {
        if (config.scenario === "dependency-slow" && method === "card") {
          await delay(1800);
        } else {
          await delay(15);
        }
        body = { provider: "local-workshop-stub", approved: true };
      } else if (url.pathname === "/pay") {
        const amount = Number(url.searchParams.get("amount") || 100);
        if (!["card", "bank"].includes(method) || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
          status = 400;
          body = { error: "invalid_payment", allowedMethods: ["card", "bank"] };
        } else if (config.scenario === "unavailable") {
          status = 503;
          body = { error: "workshop_service_unavailable" };
        } else if (config.scenario === "payment-exception" && method === "card") {
          throw new Error("WORKSHOP_PAYMENT_CONFIG_ERROR: card configuration rejected");
        } else {
          const dependencyStart = performance.now();
          const providerUrl = `http://127.0.0.1:${server.address().port}/provider?method=${method}`;
          let resultCode = "0";
          let success = false;
          try {
            const response = await fetch(providerUrl, {
              headers: { traceparent },
              signal: AbortSignal.timeout(4000)
            });
            resultCode = String(response.status);
            if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
            const provider = await response.json();
            success = true;
            body = { paid: provider.approved, method, amount, requestId };
          } finally {
            telemetry.dependency({
              name: "GET /provider",
              id: traceId,
              target: "local-workshop-stub",
              data: providerUrl,
              dependencyTypeName: "HTTP",
              duration: performance.now() - dependencyStart,
              resultCode,
              success,
              properties
            });
          }
        }
      } else {
        status = 404;
        body = { error: "not_found" };
      }
    } catch (error) {
      status = 500;
      body = { error: "payment_failed", requestId };
      console.error(JSON.stringify({ event: "request_failed", ...properties, message: error.message }));
      telemetry.exception({ exception: error, properties });
    }
    const duration = performance.now() - started;
    res.writeHead(status, { "Content-Type": "application/json", "X-Request-Id": requestId });
    res.end(JSON.stringify({ ...body, sourceCommit: config.commit, scenario: config.scenario,
      podName: properties.podName, namespace: properties.namespace }));
    telemetry.request({
      name: `${req.method} ${url.pathname}`,
      id: traceId,
      url: `http://${req.headers.host}${url.pathname}`,
      duration,
      resultCode: String(status),
      success: status < 400,
      properties
    });
    console.log(JSON.stringify({
      event: "request_completed",
      path: url.pathname,
      status,
      durationMs: Math.round(duration),
      ...properties
    }));
  });
  return server;
}

module.exports = { createApp };
