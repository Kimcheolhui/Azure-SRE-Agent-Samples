"use strict";

function createTelemetry(config) {
  if (!config.connectionString) {
    console.warn("APPLICATIONINSIGHTS_CONNECTION_STRING is absent; console-only local mode");
    return {
      request() {},
      dependency() {},
      exception() {},
      async shutdown() {}
    };
  }
  const insights = require("applicationinsights");
  const { resourceFromAttributes } = require("@opentelemetry/resources");
  const client = new insights.TelemetryClient(config.connectionString, { useGlobalProviders: false });
  client.config.azureMonitorOpenTelemetryOptions = {
    resource: resourceFromAttributes({
      "service.name": "sre-payment-api",
      "service.instance.id": config.podName || "local"
    })
  };
  client.commonProperties = {
    sourceCommit: config.commit,
    scenario: config.scenario,
    workshop: "azure-sre-agent",
    podName: config.podName || "local",
    namespace: config.namespace || "local"
  };
  client.initialize();
  return {
    request: (item) => client.trackRequest(item),
    dependency: (item) => client.trackDependency(item),
    exception: (item) => client.trackException(item),
    shutdown: () => client.shutdown()
  };
}

module.exports = { createTelemetry };
