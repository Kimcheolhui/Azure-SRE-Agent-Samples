"use strict";
const { createProvider } = require("../src/provider");
const { createApp } = require("../src/app");
const { loadConfig } = require("../src/config");

async function fixture(t, options = {}) {
  const provider = createProvider({ signatureIterations: options.iterations || 60000 });
  await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
  const events = { requests: [], dependencies: [], exceptions: [] };
  const config = { ...loadConfig({ PORT: "0",
    PAYMENT_PROVIDER_URL: `http://127.0.0.1:${provider.address().port}`,
    CARD_MERCHANT_ACCOUNT: options.cardMerchant }), commit: "abc1234" };
  const server = createApp(config, {
    request: item => events.requests.push(item), dependency: item => events.dependencies.push(item),
    exception: item => events.exceptions.push(item)
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const app of [server, provider]) {
      if (app.listening) await new Promise(resolve => { app.close(resolve); app.closeAllConnections(); });
    }
  });
  return { events, base: `http://127.0.0.1:${server.address().port}`, provider, config };
}

module.exports = { fixture };
