"use strict";

function integerSetting(value, fallback, name, min, max) {
  const number = Number(value === undefined ? fallback : value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return number;
}

function loadConfig(env = process.env) {
  const providerUrl = new URL(env.PAYMENT_PROVIDER_URL || "http://127.0.0.1:8081");
  if (!["http:", "https:"].includes(providerUrl.protocol) || providerUrl.username || providerUrl.password) {
    throw new Error("PAYMENT_PROVIDER_URL must be an HTTP(S) URL without embedded credentials");
  }
  return {
    port: integerSetting(env.PORT, 8080, "PORT", 0, 65535),
    providerUrl: providerUrl.origin,
    providerTimeoutMs: integerSetting(env.PROVIDER_REQUEST_TIMEOUT_MS, 15000,
      "PROVIDER_REQUEST_TIMEOUT_MS", 1, 60000),
    merchants: {
      card: env.CARD_MERCHANT_ACCOUNT === undefined ? "merchant-card" : env.CARD_MERCHANT_ACCOUNT,
      bank: env.BANK_MERCHANT_ACCOUNT === undefined ? "merchant-bank" : env.BANK_MERCHANT_ACCOUNT
    },
    commit: env.SOURCE_COMMIT || "unversioned",
    podName: env.POD_NAME || "local",
    namespace: env.POD_NAMESPACE || "local",
    connectionString: env.APPLICATIONINSIGHTS_CONNECTION_STRING || ""
  };
}

module.exports = { loadConfig, integerSetting };
