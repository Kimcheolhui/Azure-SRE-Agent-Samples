"use strict";

const http = require("node:http");
const { pbkdf2, createHash, randomUUID } = require("node:crypto");
const { promisify } = require("node:util");
const { performance } = require("node:perf_hooks");
const deriveKey = promisify(pbkdf2);
class InvalidAuthorization extends Error {}

function createProvider(config) {
  return http.createServer(async (req, res) => {
    const started = performance.now();
    let status = 200;
    let result;
    try {
      if (req.method === "GET" && req.url === "/health") {
        result = { status: "healthy" };
      } else if (req.method === "POST" && req.url === "/authorize") {
        let input = "";
        for await (const chunk of req) {
          input += chunk;
          if (Buffer.byteLength(input) > 4096) throw new InvalidAuthorization("Authorization request is too large");
        }
        let request;
        try {
          request = JSON.parse(input);
        } catch (error) {
          throw new InvalidAuthorization("Authorization request is not valid JSON", { cause: error });
        }
        if (!request || !["card", "bank"].includes(request.method) ||
            typeof request.merchant !== "string" || !request.merchant.trim() ||
            !Number.isFinite(request.amount) || request.amount <= 0 ||
            typeof request.requestId !== "string") {
          throw new InvalidAuthorization("Invalid authorization request");
        }
        const payload = `${request.requestId}:${request.amount}:${request.merchant}`;
        const signature = request.method === "card" ?
          (await deriveKey(payload, request.merchant, config.signatureIterations, 32, "sha256")).toString("hex") :
          createHash("sha256").update(payload).digest("hex");
        result = { approved: true, authorizationId: randomUUID(), signature };
      } else {
        status = 404;
        result = { error: "not_found" };
      }
    } catch (error) {
      status = error instanceof InvalidAuthorization ? 400 : 500;
      console.error(JSON.stringify({ event: "authorization_failed", message: error.message }));
      result = { error: status === 400 ? "invalid_authorization" : "authorization_failed" };
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    console.log(JSON.stringify({ event: "authorization_completed", path: req.url,
      status, durationMs: Math.round(performance.now() - started) }));
  });
}

module.exports = { createProvider };
