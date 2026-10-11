"use strict";

const { integerSetting } = require("./config");
const { createProvider } = require("./provider");
const port = integerSetting(process.env.PORT, 8081, "PORT", 0, 65535);
const app = createProvider({
  signatureIterations: integerSetting(process.env.SIGNATURE_ITERATIONS, 60000,
    "SIGNATURE_ITERATIONS", 1, 50000000)
});
app.on("error", error => { console.error("Provider failed:", error); process.exitCode = 1; });
app.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "provider_started", port: app.address().port }));
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => app.close(() => process.exit(0)));
}
