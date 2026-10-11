"use strict";

const scenarios = new Set(["healthy", "dependency-slow", "payment-exception", "unavailable"]);

function loadConfig(env = process.env) {
  const scenario = env.SRE_SCENARIO || "healthy";
  if (!scenarios.has(scenario)) {
    throw new Error(`Unsupported SRE_SCENARIO: ${scenario}`);
  }
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer from 0 to 65535");
  }
  return {
    port,
    scenario,
    commit: env.SOURCE_COMMIT || "local-uncommitted",
    podName: env.POD_NAME || "local",
    namespace: env.POD_NAMESPACE || "local",
    connectionString: env.APPLICATIONINSIGHTS_CONNECTION_STRING || ""
  };
}

module.exports = { loadConfig };
