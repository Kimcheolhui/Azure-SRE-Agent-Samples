import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(new URL("../..", import.meta.url).pathname);

test("AKS monitoring deployment does not dereference an optional addon identity", () => {
  const template = readFileSync(resolve(root, "infra/main.bicep"), "utf8");
  assert.ok(!template.includes("cluster.properties.addonProfiles.omsagent.identity.objectId"),
    "AKS can return omsagent.enabled/config without identity; ARM property access fails");
});

test("managed authentication, DCR and its association remain without a guessed collector identity", () => {
  const template = readFileSync(resolve(root, "infra/main.bicep"), "utf8");
  assert.ok(template.includes("useAADAuth: 'true'"));
  assert.ok(template.includes("resource containerLogs 'Microsoft.Insights/dataCollectionRules"));
  assert.ok(template.includes("resource logAssociation 'Microsoft.Insights/dataCollectionRuleAssociations"));
  assert.ok(template.includes("dataCollectionRuleId: containerLogs.id"));
  assert.ok(!template.includes("resource logPublisher"));
  assert.ok(!template.includes("monitoring-publisher"));
});
