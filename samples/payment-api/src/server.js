"use strict";

const { loadConfig } = require("./config");
const { createTelemetry } = require("./telemetry");
const { createApp } = require("./app");

const config = loadConfig();
const telemetry = createTelemetry(config);
const app = createApp(config, telemetry);
app.on("error", (error) => {
  console.error("Server failed:", error);
  process.exitCode = 1;
});
app.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "server_started",
    port: app.address().port,
    scenario: config.scenario,
    sourceCommit: config.commit
  }));
});
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log(`Received ${signal}; closing HTTP server`);
    app.close(async () => {
      try {
        await telemetry.shutdown();
        process.exit(0);
      } catch (error) {
        console.error("Telemetry shutdown failed:", error);
        process.exit(1);
      }
    });
  });
}
