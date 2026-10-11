"use strict";

const http = require("node:http");
const { randomBytes, randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");

class PaymentConfigurationError extends Error {
  constructor(method) {
    super(`Merchant account is not configured for ${method} payments`);
    this.name = "PaymentConfigurationError";
  }
}

class ProviderError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ProviderError";
  }
}

function createApp(config, telemetry) {
  return http.createServer(async (req, res) => {
    const started = performance.now();
    const requestId = randomUUID();
    const traceId = randomBytes(16).toString("hex");
    const traceparent = `00-${traceId}-${randomBytes(8).toString("hex")}-01`;
    const url = new URL(req.url, "http://localhost");
    const method = url.searchParams.get("method") || "card";
    const properties = { requestId, traceId, paymentMethod: method,
      sourceCommit: config.commit, podName: config.podName, namespace: config.namespace };
    let status = 200;
    let body;
    try {
      if (req.method !== "GET") {
        status = 405;
        body = { error: "method_not_allowed" };
      } else if (url.pathname === "/health") {
        body = { status: "healthy" };
      } else if (url.pathname === "/version") {
        body = { sourceCommit: config.commit };
      } else if (url.pathname === "/pay") {
        const amount = Number(url.searchParams.get("amount") || 100);
        if (!["card", "bank"].includes(method) || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
          status = 400;
          body = { error: "invalid_payment", allowedMethods: ["card", "bank"] };
        } else {
          const merchant = config.merchants[method];
          if (!merchant?.trim()) throw new PaymentConfigurationError(method);
          const dependencyStart = performance.now();
          const providerUrl = `${config.providerUrl}/authorize`;
          let resultCode = "0";
          let success = false;
          try {
            let response;
            try {
              response = await fetch(providerUrl, {
                method: "POST",
                headers: { traceparent, "Content-Type": "application/json" },
                body: JSON.stringify({ method, amount, merchant, requestId }),
                signal: AbortSignal.timeout(config.providerTimeoutMs)
              });
            } catch (error) {
              throw new ProviderError("Payment provider request failed", { cause: error });
            }
            resultCode = String(response.status);
            if (!response.ok) throw new ProviderError(`Payment provider returned HTTP ${response.status}`);
            let authorization;
            try {
              authorization = await response.json();
            } catch (error) {
              throw new ProviderError("Payment provider returned unreadable authorization data", { cause: error });
            }
            if (!authorization || typeof authorization.approved !== "boolean" ||
                typeof authorization.authorizationId !== "string") {
              throw new ProviderError("Payment provider returned an invalid authorization response");
            }
            success = true;
            body = { paid: authorization.approved, authorizationId: authorization.authorizationId,
              method, amount, requestId };
          } finally {
            telemetry.dependency({
              name: "POST /authorize", id: traceId, target: new URL(providerUrl).host,
              data: providerUrl, dependencyTypeName: "HTTP",
              duration: performance.now() - dependencyStart, resultCode, success, properties
            });
          }
        }
      } else {
        status = 404;
        body = { error: "not_found" };
      }
    } catch (error) {
      status = error instanceof ProviderError ? 503 : 500;
      body = { error: error instanceof ProviderError ? "payment_provider_unavailable" : "payment_failed", requestId };
      console.error(JSON.stringify({ event: "request_failed", ...properties,
        errorType: error.name, message: error.message, cause: error.cause?.message }));
      telemetry.exception({ exception: error, properties });
    }
    const duration = performance.now() - started;
    res.writeHead(status, { "Content-Type": "application/json", "X-Request-Id": requestId });
    res.end(JSON.stringify({ ...body, sourceCommit: config.commit,
      podName: config.podName, namespace: config.namespace }));
    telemetry.request({ name: `${req.method} ${url.pathname}`, id: traceId,
      url: `http://${req.headers.host}${url.pathname}`, duration,
      resultCode: String(status), success: status < 400, properties });
    console.log(JSON.stringify({ event: "request_completed", path: url.pathname,
      status, durationMs: Math.round(duration), ...properties }));
  });
}

module.exports = { createApp };
